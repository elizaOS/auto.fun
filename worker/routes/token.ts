import {
  AccountInfo,
  Connection,
  Keypair,
  ParsedAccountData,
  PublicKey,
} from "@solana/web3.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { monitorSpecificToken } from "../cron";
import {
  getDB,
  swaps,
  tokenAgents,
  TokenHolder,
  tokenHolders,
  tokens,
  vanityKeypairs,
} from "../db";
import { Env } from "../env";
import { ExternalToken } from "../externalToken";
import { logger } from "../logger";
import { getSOLPrice } from "../mcap";
import {
  applyFeaturedSort,
  calculateFeaturedScore,
  getDevnetRpcUrl,
  getFeaturedMaxValues,
  getFeaturedScoreExpression,
  getMainnetRpcUrl,
  getRpcUrl,
} from "../util";
import { getWebSocketClient } from "../websocket-client";
import { generateAdditionalTokenImages } from "./generation";
import { uploadToCloudflare } from "../uploader";

// Define the router with environment typing
const tokenRouter = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// --- Endpoint to serve images from R2 (Logging Added) ---
tokenRouter.get("/image/:filename", async (c) => {
  const filename = c.req.param("filename");
  logger.log(`[/image/:filename] Request received for filename: ${filename}`);
  try {
    if (!filename) {
      logger.warn("[/image/:filename] Filename parameter is missing");
      return c.json({ error: "Filename parameter is required" }, 400);
    }

    if (!c.env.R2) {
      logger.error("[/image/:filename] R2 storage is not available");
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // Check if this is a special generation image request
    // Format: generation-[mint]-[number].jpg
    const generationMatch = filename.match(
      /^generation-([A-Za-z0-9]{32,44})-([1-9][0-9]*)\.jpg$/,
    );

    let imageKey;
    if (generationMatch) {
      const [_, mint, number] = generationMatch;
      // This is a special request for a generation image
      imageKey = `generations/${mint}/gen-${number}.jpg`;
      logger.log(
        `[/image/:filename] Detected generation image request: ${imageKey}`,
      );
    } else {
      // Regular image request
      imageKey = `token-images/${filename}`;
    }

    logger.log(
      `[/image/:filename] Attempting to get object from R2 key: ${imageKey}`,
    );
    const object = await c.env.R2.get(imageKey);

    if (!object) {
      logger.warn(
        `[/image/:filename] Image not found in R2 for key: ${imageKey}`,
      );

      // DEBUG: List files in the token-images directory to help diagnose issues
      try {
        const prefix = imageKey.split("/")[0] + "/";
        const objects = await c.env.R2.list({
          prefix,
          limit: 10,
        });
        logger.log(
          `[/image/:filename] Files in ${prefix} directory: ${objects.objects.map((o) => o.key).join(", ")}`,
        );
      } catch (listError) {
        logger.error(
          `[/image/:filename] Error listing files in directory: ${listError}`,
        );
      }

      return c.json({ error: "Image not found" }, 404);
    }
    logger.log(
      `[/image/:filename] Found object in R2: size=${object.size}, type=${object.httpMetadata?.contentType}`,
    );

    // Determine appropriate content type
    let contentType = object.httpMetadata?.contentType || "image/jpeg";

    // For JSON files, ensure content type is application/json
    if (filename.endsWith(".json")) {
      contentType = "application/json";
    } else if (filename.endsWith(".png")) {
      contentType = "image/png";
    } else if (filename.endsWith(".gif")) {
      contentType = "image/gif";
    } else if (filename.endsWith(".svg")) {
      contentType = "image/svg+xml";
    } else if (filename.endsWith(".webp")) {
      contentType = "image/webp";
    }

    const data = await object.arrayBuffer();

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    logger.log(
      `[/image/:filename] Serving ${filename} with type ${contentType}`,
    );
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": object.size.toString(),
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });
  } catch (error) {
    logger.error(`[/image/:filename] Error serving image ${filename}:`, error);
    return c.json({ error: "Failed to serve image" }, 500);
  }
});

// --- Endpoint to serve metadata JSON from R2 (Updated to support temporary metadata) ---
tokenRouter.get("/metadata/:filename", async (c) => {
  const filename = c.req.param("filename");
  const isTemp = c.req.query("temp") === "true";

  logger.log(
    `[/metadata/:filename] Request received for filename: ${filename}, temp=${isTemp}`,
  );

  try {
    if (!filename || !filename.endsWith(".json")) {
      logger.error("[/metadata/:filename] Invalid filename format:", filename);
      return c.json({ error: "Filename parameter must end with .json" }, 400);
    }

    if (!c.env.R2) {
      logger.error("[/metadata/:filename] R2 storage is not configured");
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // Determine which location to check first based on the temp parameter
    const primaryKey = isTemp
      ? `token-metadata-temp/${filename}`
      : `token-metadata/${filename}`;
    const fallbackKey = isTemp
      ? `token-metadata/${filename}`
      : `token-metadata-temp/${filename}`;

    logger.log(
      `[/metadata/:filename] Checking primary location: ${primaryKey}`,
    );
    let object = await c.env.R2.get(primaryKey);

    // If not found in primary location, check fallback location
    if (!object) {
      logger.log(
        `[/metadata/:filename] Not found in primary location, checking fallback: ${fallbackKey}`,
      );
      object = await c.env.R2.get(fallbackKey);
    }

    if (!object) {
      logger.error(
        `[/metadata/:filename] Metadata not found in either location`,
      );
      return c.json({ error: "Metadata not found" }, 404);
    }

    logger.log(
      `[/metadata/:filename] Found metadata: size=${object.size}, type=${object.httpMetadata?.contentType}`,
    );

    const contentType = object.httpMetadata?.contentType || "application/json";
    const data = await object.text();

    // Set appropriate CORS headers for public access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": contentType,
      "Cache-Control": isTemp ? "max-age=3600" : "max-age=86400", // Shorter cache for temp metadata
    };

    logger.log(`[/metadata/:filename] Serving metadata: ${filename}`);
    return new Response(data, { headers: corsHeaders });
  } catch (error) {
    logger.error(
      `[/metadata/:filename] Error serving metadata ${filename}:`,
      error,
    );
    return c.json({ error: "Failed to serve metadata JSON" }, 500);
  }
});

export async function processSwapEvent(
  env: Env,
  swap: any,
  shouldEmitGlobal: boolean = true,
): Promise<void> {
  try {
    // Get WebSocket client
    const wsClient = getWebSocketClient(env);

    // Get DB connection to fetch token data and calculate featuredScore
    const db = getDB(env);

    // Get the token data for this swap
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, swap.tokenMint))
      .limit(1);

    // Prepare swap data for emission
    const enrichedSwap = { ...swap };

    // Add featuredScore if we have token data
    if (tokenData && tokenData.length > 0) {
      // Get max values for normalization
      const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

      // Calculate featured score
      const featuredScore = calculateFeaturedScore(
        tokenData[0],
        maxVolume,
        maxHolders,
      );

      // Add token data with featuredScore to the swap
      enrichedSwap.tokenData = {
        ...tokenData[0],
        featuredScore,
      };
    }

    // Emit to token-specific room
    await wsClient.emit(`token-${swap.tokenMint}`, "newSwap", enrichedSwap);

    // Only log in debug mode or for significant events
    if (process.env.DEBUG_WEBSOCKET) {
      logger.log(`Emitted swap event for token ${swap.tokenMint}`);
    }

    // Optionally emit to global room for activity feed
    if (shouldEmitGlobal) {
      await wsClient.emit("global", "newSwap", enrichedSwap);

      if (process.env.DEBUG_WEBSOCKET) {
        logger.log("Emitted swap event to global feed");
      }
    }

    return;
  } catch (error) {
    logger.error("Error processing swap event:", error);
    throw error;
  }
}

// Helper function to process token info after finding it on a network
async function processTokenInfo(
  c: any,
  mintPublicKey: PublicKey,
  tokenInfo: AccountInfo<Buffer>,
  connection: Connection,
  requestor: string,
) {
  // Check program ID to verify this is an SPL token
  const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  );
  const TOKEN_2022_PROGRAM_ID = new PublicKey(
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  );

  const isSplToken = tokenInfo.owner.equals(TOKEN_PROGRAM_ID);
  const isSPL2022 = tokenInfo.owner.equals(TOKEN_2022_PROGRAM_ID);

  if (!isSplToken && !isSPL2022) {
    return c.json(
      {
        error: "Not a valid SPL token. Owner: " + tokenInfo.owner.toString(),
      },
      400,
    );
  }

  logger.log(`[search-token] Token owner: ${tokenInfo.owner.toString()}`);
  logger.log(`[search-token] Token is SPL-2022: ${isSPL2022}`);

  // Get mint info - decimals and authorities
  const mintInfo = await connection.getParsedAccountInfo(mintPublicKey);
  logger.log(
    `[search-token] Mint info: ${JSON.stringify(mintInfo.value?.data)}`,
  );

  // Extract basic token info
  const parsedData = (mintInfo.value?.data as any)?.parsed;
  const decimals = parsedData?.info?.decimals || 9;
  const mintAuthority = parsedData?.info?.mintAuthority || null;

  logger.log(`[search-token] Decimals: ${decimals}`);
  logger.log(`[search-token] Mint authority: ${mintAuthority}`);

  // Initialize variables for token data
  let tokenName = "";
  let tokenSymbol = "";
  let uri = "";
  let imageUrl = "";
  let description = "";
  let updateAuthority: string | null = null;
  let foundMetadata = false;

  // For SPL-2022 tokens, check for token metadata extension first
  if (isSPL2022 && parsedData?.info?.extensions) {
    logger.log(`[search-token] Checking SPL-2022 extensions for metadata`);

    // Find the tokenMetadata extension if it exists
    const metadataExt = parsedData.info.extensions.find(
      (ext: any) => ext.extension === "tokenMetadata",
    );

    if (metadataExt && metadataExt.state) {
      logger.log(
        `[search-token] Found tokenMetadata extension: ${JSON.stringify(metadataExt.state)}`,
      );

      // Extract metadata directly from the extension
      tokenName = metadataExt.state.name || "";
      tokenSymbol = metadataExt.state.symbol || "";
      uri = metadataExt.state.uri || "";
      updateAuthority = metadataExt.state.updateAuthority || null;

      logger.log(
        `[search-token] SPL-2022 metadata - Name: ${tokenName}, Symbol: ${tokenSymbol}`,
      );
      logger.log(`[search-token] SPL-2022 metadata - URI: ${uri}`);
      logger.log(
        `[search-token] SPL-2022 metadata - Update Authority: ${updateAuthority}`,
      );

      foundMetadata = true;

      // Now fetch additional metadata from the URI if available
      if (uri) {
        logger.log(`[search-token] Fetching metadata from URI: ${uri}`);
        const uriResponse = await fetch(uri);

        if (uriResponse.ok) {
          const uriText = await uriResponse.text();
          logger.log(`[search-token] URI response: ${uriText}`);

          try {
            const uriData = JSON.parse(uriText);
            logger.log(
              `[search-token] Parsed URI data: ${JSON.stringify(uriData)}`,
            );

            // Extract image and description if available
            if (uriData.image) {
              imageUrl = uriData.image;
              logger.log(`[search-token] Found image URL in URI: ${imageUrl}`);
            }

            if (uriData.description) {
              description = uriData.description;
              logger.log(
                `[search-token] Found description in URI: ${description}`,
              );
            }
          } catch (parseError) {
            logger.error(
              `[search-token] Error parsing URI JSON: ${parseError}`,
            );
          }
        } else {
          logger.error(
            `[search-token] Failed to fetch URI: ${uriResponse.status} ${uriResponse.statusText}`,
          );
        }
      }
    } else {
      logger.log(
        `[search-token] No tokenMetadata extension found in SPL-2022 token`,
      );
    }
  }

  // Only try to get Metaplex metadata if we didn't find it in SPL-2022 extensions
  if (!foundMetadata) {
    // Get metadata PDA
    const METADATA_PROGRAM_ID = new PublicKey(
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    );
    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintPublicKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID,
    );

    logger.log(
      `[search-token] Metadata address: ${metadataAddress.toString()}`,
    );

    // Get metadata account data - direct read from chain with no fallbacks
    const metadataAccount = await connection.getAccountInfo(metadataAddress);
    if (!metadataAccount || metadataAccount.data.length === 0) {
      // For SPL-2022 tokens, we already checked extensions so this is just a warning
      // For regular SPL tokens, this is an error
      if (isSPL2022) {
        logger.warn(
          `[search-token] No Metaplex metadata found for SPL-2022 token: ${mintPublicKey.toString()}`,
        );
      } else {
        logger.error(
          `[search-token] No metadata found for token: ${mintPublicKey.toString()}`,
        );
        return c.json({ error: "No metadata found for this token" }, 404);
      }
    } else {
      // We found Metaplex metadata
      logger.log(
        `[search-token] Metadata account found, data length: ${metadataAccount.data.length} bytes`,
      );
      logger.log(
        `[search-token] Raw metadata (hex): ${Buffer.from(metadataAccount.data).toString("hex")}`,
      );

      // Direct metadata extraction
      updateAuthority = new PublicKey(
        metadataAccount.data.slice(1, 33),
      ).toString();
      logger.log(`[search-token] Update authority: ${updateAuthority}`);

      // Calculate offsets for variable-length fields
      let offset = 1 + 32 + 32; // Skip version byte + update authority + mint

      // Extract name length and value
      const nameLength = metadataAccount.data[offset];
      offset += 1;
      const nameData = metadataAccount.data.slice(offset, offset + nameLength);
      tokenName = nameData.toString("utf8").replace(/\0/g, "").trim();
      logger.log(
        `[search-token] Token name: ${tokenName} (${nameLength} bytes)`,
      );
      offset += nameLength;

      // Extract symbol - needs to account for padding between fields
      offset += 3; // Skip padding bytes before length
      const symbolLength = metadataAccount.data[offset];
      offset += 1;
      const symbolData = metadataAccount.data.slice(
        offset,
        offset + symbolLength,
      );
      tokenSymbol = symbolData.toString("utf8").replace(/\0/g, "").trim();
      logger.log(
        `[search-token] Token symbol: ${tokenSymbol} (${symbolLength} bytes)`,
      );
      offset += symbolLength;

      // Extract URI
      offset += 3; // Skip padding bytes before length
      const uriLength = metadataAccount.data[offset];
      offset += 1;
      const uriData = metadataAccount.data.slice(offset, offset + uriLength);
      uri = uriData.toString("utf8").replace(/\0/g, "").trim();
      logger.log(`[search-token] Metadata URI: ${uri} (${uriLength} bytes)`);

      foundMetadata = true;

      // Now fetch additional metadata from the URI if available
      if (uri) {
        logger.log(`[search-token] Fetching metadata from URI: ${uri}`);
        const uriResponse = await fetch(uri);

        if (uriResponse.ok) {
          const uriText = await uriResponse.text();
          logger.log(`[search-token] URI response: ${uriText}`);

          try {
            const uriData = JSON.parse(uriText);
            logger.log(
              `[search-token] Parsed URI data: ${JSON.stringify(uriData)}`,
            );

            // Extract image and description if available
            if (uriData.image) {
              imageUrl = uriData.image;
              logger.log(`[search-token] Found image URL in URI: ${imageUrl}`);
            }

            if (uriData.description) {
              description = uriData.description;
              logger.log(
                `[search-token] Found description in URI: ${description}`,
              );
            }
          } catch (parseError) {
            logger.error(
              `[search-token] Error parsing URI JSON: ${parseError}`,
            );
          }
        } else {
          logger.error(
            `[search-token] Failed to fetch URI: ${uriResponse.status} ${uriResponse.statusText}`,
          );
        }
      }
    }
  }

  // If we still didn't find metadata from either source, throw error
  if (!foundMetadata && !isSPL2022) {
    return c.json({ error: "No metadata found for this token" }, 404);
  }

  // For SPL-2022 tokens, we still consider them valid even without metadata
  // since they might not use the tokenMetadata extension

  // Check if we're in development mode
  const isLocalDev = c.env.LOCAL_DEV === "true" || c.env.LOCAL_DEV === true;

  // Determine if requestor is the creator/authority
  // In development mode, always allow any token to be imported
  const isCreator = isLocalDev
    ? true
    : updateAuthority === requestor || mintAuthority === requestor;

  logger.log(`[search-token] Is local development mode? ${isLocalDev}`);
  logger.log(`[search-token] LOCAL_DEV value: ${c.env.LOCAL_DEV}`);
  logger.log(`[search-token] Is requestor the creator? ${isCreator}`);
  logger.log(`[search-token] Request wallet: ${requestor}`);
  logger.log(`[search-token] Update authority: ${updateAuthority}`);
  logger.log(`[search-token] Mint authority: ${mintAuthority}`);

  // Debug log for final creator check result
  if (isLocalDev) {
    logger.log(
      `[search-token] Bypassing creator check in development mode. Anyone can import this token.`,
    );
  } else if (isCreator) {
    logger.log(
      `[search-token] Creator check passed - requestor is the token creator.`,
    );
  } else {
    logger.log(
      `[search-token] Creator check failed - requestor is not the token creator.`,
    );
  }

  // If we don't have names yet (possible for SPL-2022 without tokenMetadata), use defaults
  if (!tokenName) {
    tokenName = `Token ${mintPublicKey.toString().slice(0, 8)}`;
  }
  if (!tokenSymbol) {
    tokenSymbol = mintPublicKey.toString().slice(0, 4).toUpperCase();
  }

  // Return the token data
  const tokenData = {
    name: tokenName,
    symbol: tokenSymbol,
    description: description || `Token ${tokenName} (${tokenSymbol})`,
    mint: mintPublicKey.toString(),
    updateAuthority: updateAuthority,
    mintAuthority: mintAuthority || null,
    creator: updateAuthority || mintAuthority || null,
    isCreator: isCreator,
    metadataUri: uri,
    image: imageUrl,
    tokenType: isSPL2022 ? "spl-2022" : "spl-token",
    decimals: decimals,
    needsWalletSwitch: !isCreator,
  };

  logger.log(`[search-token] Final token data: ${JSON.stringify(tokenData)}`);

  return c.json(tokenData);
}

// Helper to check token balance directly on blockchain
async function checkBlockchainTokenBalance(
  c,
  mint,
  address,
  checkMultipleNetworks = false,
) {
  // Initialize return data
  let balance = 0;
  let foundNetwork = ""; // Renamed to avoid confusion with loop variable
  // Get explicit mainnet and devnet URLs
  const mainnetUrl = getMainnetRpcUrl(c.env);
  const devnetUrl = getDevnetRpcUrl(c.env);

  // Log detailed connection info and environment settings
  logger.log(`IMPORTANT DEBUG INFO FOR TOKEN BALANCE CHECK:`);
  logger.log(`Address: ${address}`);
  logger.log(`Mint: ${mint}`);
  logger.log(`CheckMultipleNetworks: ${checkMultipleNetworks}`);
  logger.log(`LOCAL_DEV setting: ${c.env.LOCAL_DEV}`);
  logger.log(`ENV.NETWORK setting: ${c.env.NETWORK || "not set"}`);
  logger.log(`Mainnet URL: ${mainnetUrl}`);
  logger.log(`Devnet URL: ${devnetUrl}`);

  // Determine which networks to check - ONLY mainnet and devnet if in local mode
  const networksToCheck = checkMultipleNetworks
    ? [
      { name: "mainnet", url: mainnetUrl },
      { name: "devnet", url: devnetUrl },
    ]
    : [
      {
        name: c.env.NETWORK || "devnet",
        url: c.env.NETWORK === "mainnet" ? mainnetUrl : devnetUrl,
      },
    ];

  logger.log(
    `Will check these networks: ${networksToCheck.map((n) => `${n.name} (${n.url})`).join(", ")}`,
  );

  // Try each network until we find a balance
  for (const network of networksToCheck) {
    try {
      logger.log(
        `Checking ${network.name} (${network.url}) for token balance...`,
      );
      const connection = new Connection(network.url, "confirmed");

      // Convert string addresses to PublicKey objects
      const mintPublicKey = new PublicKey(mint);
      const userPublicKey = new PublicKey(address);

      logger.log(
        `Getting token accounts for ${address} for mint ${mint} on ${network.name}`,
      );

      // Fetch token accounts with a simple RPC call
      const response = await connection.getTokenAccountsByOwner(
        userPublicKey,
        { mint: mintPublicKey },
        { commitment: "confirmed" },
      );

      // Log the number of accounts found
      logger.log(
        `Found ${response.value.length} token accounts on ${network.name}`,
      );

      // If we have accounts, calculate total balance
      if (response && response.value && response.value.length > 0) {
        let networkBalance = 0;

        // Log each account
        for (let i = 0; i < response.value.length; i++) {
          const { pubkey } = response.value[i];
          logger.log(`Account ${i + 1}: ${pubkey.toString()}`);
        }

        // Get token balances from all accounts
        for (const { pubkey } of response.value) {
          try {
            const accountInfo = await connection.getTokenAccountBalance(pubkey);
            if (accountInfo.value) {
              const amount = accountInfo.value.amount;
              const decimals = accountInfo.value.decimals;
              const tokenAmount = Number(amount) / Math.pow(10, decimals);
              networkBalance += tokenAmount;
              logger.log(
                `Account ${pubkey.toString()} has ${tokenAmount} tokens`,
              );
            }
          } catch (balanceError) {
            logger.error(
              `Error getting token account balance: ${balanceError}`,
            );
            // Continue with other accounts
          }
        }

        // If we found tokens on this network, use this balance
        if (networkBalance > 0) {
          balance = networkBalance;
          foundNetwork = network.name;
          logger.log(
            `SUCCESS: Found balance of ${balance} tokens on ${foundNetwork}`,
          );
          break; // Stop checking other networks once we find a balance
        } else {
          logger.log(
            `No balance found on ${network.name} despite finding accounts`,
          );
        }
      } else {
        logger.log(`No token accounts found on ${network.name}`);
      }
    } catch (netError) {
      logger.error(
        `Error checking ${network.name} for token balance: ${netError}`,
      );
      // Continue to next network
    }
  }

  // Return the balance information
  logger.log(
    `Final result: Balance=${balance}, Network=${foundNetwork || "none"}`,
  );
  return c.json({
    balance,
    percentage: 0, // We don't know the percentage when checking directly
    isCreator: false, // We don't know if creator when checking directly
    mint,
    address,
    network: foundNetwork || c.env.NETWORK || "unknown",
    onChain: true,
  });
}

// Function to process a token update and emit WebSocket events
export async function processTokenUpdateEvent(
  env: Env,
  tokenData: any,
  shouldEmitGlobal: boolean = false,
): Promise<void> {
  try {
    // Get WebSocket client
    const wsClient = getWebSocketClient(env);

    // Get DB connection and calculate featuredScore
    const db = getDB(env);
    const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

    // Create enriched token data with featuredScore
    const enrichedTokenData = {
      ...tokenData,
      featuredScore: calculateFeaturedScore(tokenData, maxVolume, maxHolders),
    };

    // Always emit to token-specific room
    await wsClient.emit(
      `token-${tokenData.mint}`,
      "updateToken",
      enrichedTokenData,
    );

    if (process.env.DEBUG_WEBSOCKET) {
      logger.log(`Emitted token update event for ${tokenData.mint}`);
    }

    // Optionally emit to global room for activity feed
    if (shouldEmitGlobal) {
      await wsClient.emit("global", "updateToken", {
        ...enrichedTokenData,
        timestamp: new Date(),
      });

      if (process.env.DEBUG_WEBSOCKET) {
        logger.log("Emitted token update event to global feed");
      }
    }

    return;
  } catch (error) {
    logger.error("Error processing token update event:", error);
    // Don't throw to avoid breaking other functionality
  }
}

export async function updateHoldersCache(
  env: Env,
  mint: string,
  imported: boolean = false,
): Promise<number> {
  try {
    // Use the utility function to get the RPC URL with proper API key
    const connection = new Connection(getRpcUrl(env, imported));
    const db = getDB(env);

    // Get all token accounts for this mint using getParsedProgramAccounts
    // This method is more reliable for finding all holders
    const accounts = await connection.getParsedProgramAccounts(
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // Token program
      {
        filters: [
          {
            dataSize: 165, // Size of token account
          },
          {
            memcmp: {
              offset: 0,
              bytes: mint, // Mint address
            },
          },
        ],
      },
    );

    if (!accounts || accounts.length === 0) {
      logger.log(`No accounts found for token ${mint}`);
      return 0;
    }

    logger.log(`Found ${accounts.length} token accounts for mint ${mint}`);

    // Process accounts to extract holder information
    let totalTokens = 0;
    const holders: TokenHolder[] = [];

    // Process each account to get holder details
    for (const account of accounts) {
      try {
        const parsedAccountInfo = account.account.data as ParsedAccountData;
        const tokenBalance =
          parsedAccountInfo.parsed?.info?.tokenAmount?.uiAmount || 0;

        // Skip accounts with zero balance
        if (tokenBalance <= 0) continue;

        const ownerAddress = parsedAccountInfo.parsed?.info?.owner || "";

        // Skip accounts without owner
        if (!ownerAddress) continue;

        // Add to total tokens for percentage calculation
        totalTokens += tokenBalance;

        holders.push({
          id: crypto.randomUUID(),
          mint,
          address: ownerAddress,
          amount: tokenBalance,
          percentage: 0, // Will calculate after we have the total
          lastUpdated: new Date().toISOString(),
        });
      } catch (error: any) {
        logger.error(`Error processing account for ${mint}:`, error);
        // Continue with other accounts even if one fails
        continue;
      }
    }

    // Calculate percentages now that we have the total
    if (totalTokens > 0) {
      for (const holder of holders) {
        holder.percentage = (holder.amount / totalTokens) * 100;
      }
    }

    // Sort holders by amount (descending)
    holders.sort((a, b) => b.amount - a.amount);

    // logger.log(`Processing ${holders.length} holders for token ${mint}`);

    // Clear existing holders and insert new ones
    // logger.log(`Clearing existing holders for token ${mint}`);
    await db.delete(tokenHolders).where(eq(tokenHolders.mint, mint));

    // For large number of holders, we need to limit what we insert
    // to avoid overwhelming the database
    const MAX_HOLDERS_TO_SAVE = 500; // Reasonable limit for most UI needs
    const holdersToSave =
      holders.length > MAX_HOLDERS_TO_SAVE
        ? holders.slice(0, MAX_HOLDERS_TO_SAVE)
        : holders;

    // logger.log(`Will insert ${holdersToSave.length} holders (from ${holders.length} total) for token ${mint}`);

    if (holdersToSave.length > 0) {
      // Use a very small batch size to avoid SQLite parameter limits
      const BATCH_SIZE = 10;

      // Insert in batches to avoid overwhelming the database
      for (let i = 0; i < holdersToSave.length; i += BATCH_SIZE) {
        try {
          const batch = holdersToSave.slice(i, i + BATCH_SIZE);
          const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(holdersToSave.length / BATCH_SIZE);

          // logger.log(`Inserting batch ${batchNumber}/${totalBatches} (${batch.length} holders) for token ${mint}`);

          await db.insert(tokenHolders).values(batch);

          // logger.log(`Successfully inserted batch ${batchNumber}/${totalBatches} for token ${mint}`);
        } catch (insertError) {
          logger.error(`Error inserting batch for token ${mint}:`, insertError);
          // Continue with next batch even if this one fails
        }
      }

      try {
        const wsClient = getWebSocketClient(env);
        // Only emit a limited set of holders to avoid overwhelming WebSockets
        const limitedHolders = holdersToSave.slice(0, 50);
        wsClient.emit(`token-${mint}`, "newHolder", limitedHolders);
        // logger.log(`Emitted WebSocket update with ${limitedHolders.length} holders`);
      } catch (wsError) {
        logger.error(`WebSocket error when emitting holder update:`, wsError);
        // Don't fail if WebSocket fails
      }
    }

    // Update token holder count with the ACTUAL total count
    // even if we've only stored a subset
    await db
      .update(tokens)
      .set({
        holderCount: holders.length, // Use full count, not just what we saved
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    // Emit WebSocket event to notify of holder update
    try {
      // Get updated token data
      const tokenData = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      if (tokenData && tokenData.length > 0) {
        // Emit event with updated holder count
        await processTokenUpdateEvent(env, {
          ...tokenData[0],
          event: "holdersUpdated",
          holderCount: holders.length, // Use full count here too
          timestamp: new Date().toISOString(),
        });

        // logger.log(`Emitted holder update event for token ${mint} with ${holders.length} holders count`);
      }
    } catch (wsError) {
      // Don't fail if WebSocket fails
      logger.error(`WebSocket error when emitting holder update: ${wsError}`);
    }

    return holders.length; // Return full count, not just what we saved
  } catch (error) {
    logger.error(`Error updating holders for token ${mint}:`, error);
    return 0; // Return 0 instead of throwing to avoid crashing the endpoint
  }
}

tokenRouter.get("/image/:filename", async (c) => {
  const filename = c.req.param("filename");
  logger.log(`[/image/:filename] Request received for filename: ${filename}`);
  try {
    if (!filename) {
      logger.warn("[/image/:filename] Filename parameter is missing");
      return c.json({ error: "Filename parameter is required" }, 400);
    }

    if (!c.env.R2) {
      logger.error("[/image/:filename] R2 storage is not available");
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // Check if this is a special generation image request
    // Format: generation-[mint]-[number].jpg
    const generationMatch = filename.match(
      /^generation-([A-Za-z0-9]{32,44})-([1-9][0-9]*)\.jpg$/,
    );

    let imageKey;
    if (generationMatch) {
      const [_, mint, number] = generationMatch;
      // This is a special request for a generation image
      imageKey = `generations/${mint}/gen-${number}.jpg`;
      logger.log(
        `[/image/:filename] Detected generation image request: ${imageKey}`,
      );
    } else {
      // Regular image request
      imageKey = `token-images/${filename}`;
    }

    logger.log(
      `[/image/:filename] Attempting to get object from R2 key: ${imageKey}`,
    );
    const object = await c.env.R2.get(imageKey);

    if (!object) {
      logger.warn(
        `[/image/:filename] Image not found in R2 for key: ${imageKey}`,
      );

      // DEBUG: List files in the token-images directory to help diagnose issues
      try {
        const prefix = imageKey.split("/")[0] + "/";
        const objects = await c.env.R2.list({
          prefix,
          limit: 10,
        });
        logger.log(
          `[/image/:filename] Files in ${prefix} directory: ${objects.objects.map((o) => o.key).join(", ")}`,
        );
      } catch (listError) {
        logger.error(
          `[/image/:filename] Error listing files in directory: ${listError}`,
        );
      }

      return c.json({ error: "Image not found" }, 404);
    }
    logger.log(
      `[/image/:filename] Found object in R2: size=${object.size}, type=${object.httpMetadata?.contentType}`,
    );

    // Determine appropriate content type
    let contentType = object.httpMetadata?.contentType || "image/jpeg";

    // For JSON files, ensure content type is application/json
    if (filename.endsWith(".json")) {
      contentType = "application/json";
    } else if (filename.endsWith(".png")) {
      contentType = "image/png";
    } else if (filename.endsWith(".gif")) {
      contentType = "image/gif";
    } else if (filename.endsWith(".svg")) {
      contentType = "image/svg+xml";
    } else if (filename.endsWith(".webp")) {
      contentType = "image/webp";
    }

    const data = await object.arrayBuffer();

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    logger.log(
      `[/image/:filename] Serving ${filename} with type ${contentType}`,
    );
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": object.size.toString(),
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });
  } catch (error) {
    logger.error(`[/image/:filename] Error serving image ${filename}:`, error);
    return c.json({ error: "Failed to serve image" }, 500);
  }
});

tokenRouter.get("/tokens", async (c) => {
  try {
    const queryParams = c.req.query();
    const isSearching = !!queryParams.search;

    const limit = isSearching ? 5 : parseInt(queryParams.limit as string) || 50;
    const page = parseInt(queryParams.page as string) || 1;
    const skip = (page - 1) * limit;

    // Get search, status, creator params for filtering
    const search = queryParams.search as string;
    const status = queryParams.status as string;
    const creator = queryParams.creator as string;
    const sortBy = search
      ? "marketCapUSD"
      : (queryParams.sortBy as string) || "createdAt";
    const sortOrder = (queryParams.sortOrder as string) || "desc";

    // Use a shorter timeout for test environments
    const timeoutDuration = c.env.NODE_ENV === "test" ? 2000 : 5000;

    // Create a timeout promise to prevent hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Database query timed out")),
        timeoutDuration,
      ),
    );

    const countTimeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(
        () => reject(new Error("Count query timed out")),
        timeoutDuration / 2,
      ),
    );

    const db = getDB(c.env);

    // Get max values for normalization first - we need these for both the featuredScore and sorting
    const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

    // Prepare a basic query
    const tokenQuery = async () => {
      try {
        // Get all columns from the tokens table programmatically
        const allTokensColumns = Object.fromEntries(
          Object.entries(tokens)
            .filter(
              ([key, value]) => typeof value === "object" && "name" in value,
            )
            .map(([key, value]) => [key, value]),
        );

        // Start with a basic query that includes the weighted score
        let tokensQuery = db
          .select({
            // Include all columns
            ...allTokensColumns,
            // Add the weighted score as a column in the result
            featuredScore: getFeaturedScoreExpression(maxVolume, maxHolders),
          })
          .from(tokens) as any;

        // Apply filters
        if (status) {
          tokensQuery = tokensQuery.where(eq(tokens.status, status));
        } else {
          // By default, don't show pending tokens
          tokensQuery = tokensQuery.where(sql`${tokens.status} != 'pending'`);
        }

        if (creator) {
          tokensQuery = tokensQuery.where(eq(tokens.creator, creator));
        }

        if (search) {
          // This is a simplified implementation - in production you'd use a proper search mechanism
          tokensQuery = tokensQuery.where(
            sql`(${tokens.name} LIKE ${"%" + search + "%"} OR 
                 ${tokens.ticker} LIKE ${"%" + search + "%"} OR 
                 ${tokens.mint} LIKE ${"%" + search + "%"})`,
          );
        }

        // Apply sorting - map frontend sort values to actual DB columns
        // Handle "featured" sort as a special case
        if (sortBy === "featured") {
          // Apply the weighted sort with the max values
          tokensQuery = applyFeaturedSort(
            tokensQuery,
            maxVolume,
            maxHolders,
            sortOrder,
          );
        } else {
          // For other columns, safely map to actual db columns
          const validSortColumns = {
            marketCapUSD: tokens.marketCapUSD,
            createdAt: tokens.createdAt,
            holderCount: tokens.holderCount,
            tokenPriceUSD: tokens.tokenPriceUSD,
            name: tokens.name,
            ticker: tokens.ticker,
            volume24h: tokens.volume24h,
            curveProgress: tokens.curveProgress,
          };

          // Use the mapped column or default to createdAt
          const sortColumn =
            validSortColumns[sortBy as keyof typeof validSortColumns] ||
            tokens.createdAt;

          if (sortOrder.toLowerCase() === "desc") {
            tokensQuery = tokensQuery.orderBy(desc(sortColumn));
          } else {
            tokensQuery = tokensQuery.orderBy(sortColumn);
          }
        }

        // Apply pagination
        tokensQuery = tokensQuery.limit(limit).offset(skip);

        // Execute the query
        return await tokensQuery;
      } catch (error) {
        logger.error("Error in token query:", error);
        return [];
      }
    };

    const countPromise = async () => {
      const countQuery = db.select({ count: sql`count(*)` }).from(tokens);
      let finalQuery: any;
      if (status) {
        finalQuery = countQuery.where(eq(tokens.status, status));
      } else {
        finalQuery = countQuery.where(sql`${tokens.status} != 'pending'`);
      }
      if (creator) {
        finalQuery = countQuery.where(eq(tokens.creator, creator));
      }
      if (search) {
        finalQuery = countQuery.where(
          sql`(${tokens.name} LIKE ${"%" + search + "%"} OR 
               ${tokens.ticker} LIKE ${"%" + search + "%"} OR 
               ${tokens.mint} LIKE ${"%" + search + "%"})`,
        );
      }

      const totalCountResult = await finalQuery;
      return Number(totalCountResult[0]?.count || 0);
    };

    // Try to execute the query with a timeout
    let tokensResult;
    let total = 0;

    try {
      [tokensResult, total] = await Promise.all([
        Promise.race([tokenQuery(), timeoutPromise]),
        Promise.race([countPromise(), countTimeoutPromise]),
      ]);
    } catch (error) {
      logger.error("Token query failed or timed out:", error);
      tokensResult = [];
    }

    const totalPages = Math.ceil(total / limit);

    return c.json({
      tokens: tokensResult,
      page,
      totalPages,
      total,
      hasMore: page < totalPages,
    });
  } catch (error) {
    logger.error("Error in token route:", error);
    // Return empty results rather than error
    return c.json({
      tokens: [],
      page: 1,
      totalPages: 0,
      total: 0,
    });
  }
});

/**
 * used for importing tokens
 * will only search in mainnet because it's easier to test popular solana tokens that way.
 * we don't want to accidentally import devnet tokens into our system
 */
tokenRouter.post("/search-token", async (c) => {
  const body = await c.req.json();
  const { mint, requestor } = body;

  if (!mint || typeof mint !== "string") {
    return c.json({ error: "Invalid mint address" }, 400);
  }

  if (!requestor || typeof requestor !== "string") {
    return c.json({ error: "Missing or invalid requestor" }, 400);
  }

  // Validate mint address
  const mintPublicKey = new PublicKey(mint);
  logger.log(`[search-token] Searching for token ${mint}`);

  const connection = new Connection(c.env.MAINNET_SOLANA_RPC_URL, "confirmed");

  // Try to find the token on mainnet
  try {
    const tokenInfo = await connection.getAccountInfo(mintPublicKey);
    if (tokenInfo) {
      logger.log(
        `[search-token] Found token on primary network (${c.env.NETWORK || "default"})`,
      );
      // Continue with the token info we found
      return await processTokenInfo(
        c,
        mintPublicKey,
        tokenInfo,
        connection,
        requestor,
      );
    }
  } catch (error) {
    logger.error(`[search-token] Error checking primary network: ${error}`);
  }
});

tokenRouter.get("/token/:mint/holders", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Parse pagination parameters
    const limit = parseInt(c.req.query("limit") || "50");
    const page = parseInt(c.req.query("page") || "1");
    const offset = (page - 1) * limit;

    const db = getDB(c.env);

    // Get holders from database directly
    const holders = await db
      .select()
      .from(tokenHolders)
      .where(eq(tokenHolders.mint, mint))
      .orderBy(desc(tokenHolders.amount));

    if (!holders || holders.length === 0) {
      return c.json({
        holders: [],
        page: 1,
        totalPages: 0,
        total: 0,
      });
    }

    // Paginate results
    const paginatedHolders = holders.slice(offset, offset + limit);

    return c.json({
      holders: paginatedHolders,
      page: page,
      totalPages: Math.ceil(holders.length / limit),
      total: holders.length,
    });
  } catch (error) {
    logger.error(`Database error in token holders route: ${error}`);
    return c.json(
      {
        holders: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Database error",
      },
      500,
    );
  }
});

tokenRouter.get("/token/:mint/price", async (c) => {
  try {
    const mint = c.req.param("mint");

    // Validate mint address
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get token data from database
    const db = getDB(c.env);
    const tokenData = await (db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1) as any);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    const token = tokenData[0];

    // Return actual token price data
    return c.json({
      price: token.currentPrice || 0.001,
      priceUSD: token.tokenPriceUSD || 0.0001,
      marketCap: token.liquidity || 1000,
      marketCapUSD: token.marketCapUSD || 120,
      priceChange24h: token.priceChange24h || 0,
      volume24h: token.volume24h || 0,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error(`Error getting token price: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

tokenRouter.get("/token/:mint", async (c) => {
  console.log("token/:mint");
  try {
    const mint = c.req.param("mint");

    // Validate mint address
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get token data
    const db = getDB(c.env);
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);
    const token = tokenData[0];

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found", mint }, 404);
    }

    // Get fresh SOL price
    const solPrice = await getSOLPrice(c.env);

    /**
     * Use DB as source of truth for imported tokens since we have
     * fetched and stored all the market data. we don't need to calculate
     * anything based on our program variables.
     */
    if (Number(token.imported) === 1) {
      const updatedToken = await db
        .update(tokens)
        .set({
          solPriceUSD: solPrice,
          currentPrice: (token.tokenPriceUSD || 0) / solPrice,
        })
        .where(eq(tokens.mint, mint))
        .returning();
      return c.json(updatedToken[0]);
    }

    // Check for additional images and generate if needed
    // This will run in the background without delaying the response
    if (Number(token.imported) === 0) {
      try {
        // Check if generation images exist
        const generationImagesPrefix = `generations/${mint}/`;
        let hasGenerationImages = false;

        if (c.env.R2) {
          const objects = await c.env.R2.list({
            prefix: generationImagesPrefix,
            limit: 1,
          });

          hasGenerationImages = objects.objects.length > 0;
          logger.log(
            `Token ${mint} has generation images: ${hasGenerationImages}`,
          );

          if (!hasGenerationImages) {
            // Generate additional images in the background
            c.executionCtx.waitUntil(
              generateAdditionalTokenImages(
                c.env,
                mint,
                token.description || "",
              ),
            );
            logger.log(
              `Initiated background generation of additional images for token ${mint}`,
            );
          }
        }
      } catch (imageCheckError) {
        logger.error(
          `Error checking for generation images: ${imageCheckError}`,
        );
        // Don't block the response if this check fails
      }
    }

    // Only refresh holder data if explicitly requested
    // const refreshHolders = c.req.query("refresh_holders") === "true";
    // if (refreshHolders) {
    const imported = Number(token.imported) === 1;
    logger.log(`Refreshing holders data for token ${mint}`);
    await updateHoldersCache(c.env, mint, imported);
    // }

    // Set default values for critical fields if they're missing
    const TOKEN_DECIMALS = token.tokenDecimals || 6;
    const defaultReserveAmount = 1000000000000; // 1 trillion (default token supply)
    const defaultReserveLamport = Number(c.env.VIRTUAL_RESERVES || 28000000000); // 2.8 SOL (default reserve / 28 in mainnet)

    // Make sure reserveAmount and reserveLamport have values
    token.reserveAmount = token.reserveAmount || defaultReserveAmount;
    token.reserveLamport = token.reserveLamport || defaultReserveLamport;

    // Update or set default values for missing fields
    if (!token.currentPrice && token.reserveAmount && token.reserveLamport) {
      token.currentPrice =
        Number(token.reserveLamport) /
        1e9 /
        (Number(token.reserveAmount) / Math.pow(10, TOKEN_DECIMALS));
    }

    // Calculate tokenPriceUSD in the same way as the old code
    const tokenPriceInSol =
      (token.currentPrice || 0) / Math.pow(10, TOKEN_DECIMALS);
    token.tokenPriceUSD =
      (token.currentPrice || 0) > 0
        ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
        : 0;

    // const tokenMarketData = await calculateTokenMarketData(token, solPrice, c.env);

    // Update solPriceUSD
    token.solPriceUSD = solPrice;

    // Calculate or update marketCapUSD if we have tokenPriceUSD
    token.marketCapUSD = token.tokenPriceUSD * (token.tokenSupplyUiAmount || 0);

    // Get virtualReserves and curveLimit from env or set defaults
    const virtualReserves = c.env.VIRTUAL_RESERVES
      ? Number(c.env.VIRTUAL_RESERVES)
      : 28000000000;
    const curveLimit = c.env.CURVE_LIMIT
      ? Number(c.env.CURVE_LIMIT)
      : 113000000000;

    // Update virtualReserves and curveLimit
    token.virtualReserves = token.virtualReserves || virtualReserves;
    token.curveLimit = token.curveLimit || curveLimit;

    // Calculate or update curveProgress using the original formula
    token.curveProgress =
      token.status === "migrated"
        ? 100
        : ((token.reserveLamport - token.virtualReserves) /
          (token.curveLimit - token.virtualReserves)) *
        100;

    // Get token holders count
    const holdersCountQuery = await db
      .select({ count: sql<number>`count(*)` })
      .from(tokenHolders)
      .where(eq(tokenHolders.mint, mint));

    const holdersCount = holdersCountQuery[0]?.count || 0;
    token.holderCount = holdersCount;

    // Update token in database if we've calculated new values
    await db
      .update(tokens)
      .set({
        tokenPriceUSD: token.tokenPriceUSD,
        currentPrice: token.currentPrice,
        marketCapUSD: token.marketCapUSD,
        solPriceUSD: token.solPriceUSD,
        curveProgress: token.curveProgress,
        virtualReserves: token.virtualReserves,
        curveLimit: token.curveLimit,
        holderCount: token.holderCount,
        // Only update reserveAmount and reserveLamport if they were null
        ...(tokenData[0].reserveAmount === null
          ? { reserveAmount: token.reserveAmount }
          : {}),
        ...(tokenData[0].reserveLamport === null
          ? { reserveLamport: token.reserveLamport }
          : {}),
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    console.log("currentPrice", token.currentPrice);
    console.log("tokenPriceUSD", token.tokenPriceUSD);
    console.log("marketCapUSD", token.marketCapUSD);

    // Format response with additional data
    return c.json(token);
  } catch (error) {
    logger.error(`Error getting token: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

tokenRouter.post("/check-token", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Get token from request
    const body = await c.req.json();
    const { tokenMint, imageUrl, metadataUrl } = body;
    if (!tokenMint) {
      return c.json({ error: "Token mint address is required" }, 400);
    }

    logger.log(`Manual token check requested for: ${tokenMint}`);

    // Basic token format validation - allow wider range of characters for testing
    // But still enforce basic length rules
    if (
      typeof tokenMint !== "string" ||
      tokenMint.length < 30 ||
      tokenMint.length > 50
    ) {
      logger.warn(`Invalid token mint format (wrong length): ${tokenMint}`);
      return c.json(
        {
          success: false,
          tokenFound: false,
          message: "Invalid token mint address length",
        },
        400,
      );
    }

    // First check if token exists in DB regardless of validity
    const db = getDB(c.env);
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, tokenMint))
      .limit(1);

    if (existingToken && existingToken.length > 0) {
      // If we have new image or metadata URLs, update the token
      if (
        (imageUrl || metadataUrl) &&
        (existingToken[0].image === "" || existingToken[0].url === "")
      ) {
        await db
          .update(tokens)
          .set({
            image: imageUrl || existingToken[0].image || "",
            url: metadataUrl || existingToken[0].url || "",
            lastUpdated: new Date().toISOString(),
          })
          .where(eq(tokens.mint, tokenMint));

        logger.log(`Updated image and metadata URLs for token ${tokenMint}`);

        // Return the updated token
        const updatedToken = {
          ...existingToken[0],
          image: imageUrl || existingToken[0].image || "",
          url: metadataUrl || existingToken[0].url || "",
        };

        return c.json({
          success: true,
          tokenFound: true,
          message: "Token exists and URLs updated",
          token: updatedToken,
        });
      }

      logger.log(`Token ${tokenMint} already exists in database`);
      return c.json({
        success: true,
        tokenFound: true,
        message: "Token already exists in database",
        token: existingToken[0],
      });
    }

    try {
      // Try to create a simple record first if nothing exists
      const now = new Date().toISOString();
      const tokenId = crypto.randomUUID();

      // Insert with all required fields from the schema
      await db.insert(tokens).values({
        id: tokenId,
        mint: tokenMint,
        name: `Token ${tokenMint.slice(0, 8)}`,
        ticker: "TOKEN",
        url: metadataUrl || "", // Use provided URL if available
        image: imageUrl || "", // Use provided image if available
        creator: user.publicKey || "unknown",
        status: "active",
        tokenPriceUSD: 0,
        createdAt: now,
        lastUpdated: now,
        txId: "",
      });

      // For response, create a simplified token object
      const tokenData = {
        id: tokenId,
        mint: tokenMint,
        name: `Token ${tokenMint.slice(0, 8)}`,
        ticker: "TOKEN",
        creator: user.publicKey || "unknown",
        status: "active",
        url: metadataUrl || "",
        image: imageUrl || "",
        createdAt: now,
      };

      logger.log(`Created basic token record for ${tokenMint}`);

      // Emit event to websocket clients
      try {
        const wsClient = getWebSocketClient(c.env);
        await wsClient.emit("global", "newToken", {
          ...tokenData,
          timestamp: new Date(),
        });
        logger.log(`WebSocket event emitted for token ${tokenMint}`);
      } catch (wsError) {
        // Don't fail if WebSocket fails
        logger.error(`WebSocket error: ${wsError}`);
      }

      // Now try monitoring to find more details
      try {
        // Run extended check to look for token on chain
        const result = await monitorSpecificToken(c.env, tokenMint);

        return c.json({
          success: true,
          tokenFound: true,
          message: result.message || "Token added to database",
          token: tokenData,
        });
      } catch (monitorError) {
        // If monitoring fails, we still have the basic record
        logger.error(`Error in monitorSpecificToken: ${monitorError}`);
        return c.json({
          success: true,
          tokenFound: true,
          message:
            "Basic token record created, detailed info will update later",
          token: tokenData,
        });
      }
    } catch (dbError) {
      logger.error(`Error creating token in database: ${dbError}`);

      // Try monitoring anyway as fallback
      try {
        const result = await monitorSpecificToken(c.env, tokenMint);
        return c.json({
          success: result.found,
          tokenFound: result.found,
          message:
            result.message ||
            "Error creating database record but monitoring succeeded",
        });
      } catch (monitorError) {
        logger.error(`Both database and monitoring failed: ${monitorError}`);
        return c.json({
          success: false,
          tokenFound: false,
          message: "Failed to create token record and monitoring failed",
          error: `${dbError instanceof Error ? dbError.message : "Unknown database error"}`,
        });
      }
    }
  } catch (error) {
    logger.error("Error checking token:", error);
    return c.json(
      {
        success: false,
        tokenFound: false,
        error: "Failed to check token",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

tokenRouter.post("/create-token", async (c) => {
  console.log("****** create-token ******\n");
  try {
    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const body = await c.req.json();
    console.log("****** body ******\n", body);
    const {
      tokenMint,
      mint,
      name,
      symbol,
      txId,
      description,
      twitter,
      telegram,
      farcaster,
      website,
      discord,
      imageUrl,
      metadataUrl,
      imported,
    } = body;

    const mintAddress = tokenMint || mint;
    if (!mintAddress) {
      return c.json({ error: "Token mint address is required" }, 400);
    }

    logger.log(`Creating token record for: ${mintAddress}`);

    const db = getDB(c.env);

    // Check if token already exists
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mintAddress))
      .limit(1);

    if (existingToken && existingToken.length > 0) {
      return c.json(
        {
          error: "Token already exists",
          token: existingToken[0],
        },
        409,
      );
    }

    try {
      // Create token data with all required fields from the token schema
      const now = new Date().toISOString();
      const tokenId = crypto.randomUUID();
      console.log("****** imported ******\n", imported);

      // Convert imported to number (1 for true, 0 for false)
      const importedValue = imported === true ? 1 : 0;

      // Insert with all required fields from the schema
      await db.insert(tokens).values({
        id: tokenId,
        mint: mintAddress,
        name: name || `Token ${mintAddress.slice(0, 8)}`,
        ticker: symbol || "TOKEN",
        url: metadataUrl || "",
        image: imageUrl || "",
        description: description || "",
        twitter: twitter || "",
        telegram: telegram || "",
        farcaster: farcaster || "",
        website: website || "",
        discord: discord || "",
        creator: user.publicKey || "unknown",
        status: imported ? "locked" : "active",
        tokenPriceUSD: 0.00000001,
        createdAt: now,
        lastUpdated: now,
        txId: txId || "create-" + tokenId,
        imported: importedValue,
      });

      // For response, include just what we need
      const tokenData = {
        id: tokenId,
        mint: mintAddress,
        name: name || `Token ${mintAddress.slice(0, 8)}`,
        ticker: symbol || "TOKEN",
        description: description || "",
        twitter: twitter || "",
        telegram: telegram || "",
        farcaster: farcaster || "",
        website: website || "",
        discord: discord || "",
        creator: user.publicKey || "unknown",
        status: imported ? "locked" : "active",
        url: metadataUrl || "",
        image: imageUrl || "",
        createdAt: now,
        imported: importedValue,
      };

      if (imported) {
        const importedToken = new ExternalToken(c.env, mintAddress);
        const { marketData } = await importedToken.registerWebhook();
        importedToken.fetchHistoricalSwapData();
        Object.assign(tokenData, marketData.newTokenData);
      } else {
        // For non-imported tokens, generate additional images in the background
        c.executionCtx.waitUntil(
          generateAdditionalTokenImages(c.env, mintAddress, description || ""),
        );
      }

      return c.json({ success: true, token: tokenData });
    } catch (error) {
      logger.error("Error creating token:", error);
      return c.json(
        { error: "Failed to create token record", details: error },
        500,
      );
    }
  } catch (error) {
    logger.error("Error in create-token endpoint:", error);
    return c.json({ error: "Internal server error", details: error }, 500);
  }
});

tokenRouter.get("/token/:mint/refresh-holders", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // logger.log(
    //   `Refreshing holders data for token ${mint} requested by ${user.publicKey}`,
    // );

    // Update holders for this specific token
    const imported = Number(c.req.query("imported") || 0) === 1;
    const holderCount = await updateHoldersCache(c.env, mint, imported);

    return c.json({
      success: true,
      message: `Updated holders data for token ${mint}`,
      holderCount,
    });
  } catch (error) {
    logger.error("Error updating holders data:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

tokenRouter.get("/swaps/:mint", async (c) => {
  // logger.log(`Swaps endpoint called for mint: ${c.req.param("mint")}`);
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Parse pagination parameters
    const limit = parseInt(c.req.query("limit") || "50");
    const page = parseInt(c.req.query("page") || "1");
    const offset = (page - 1) * limit;

    // Get the DB connection
    const db = getDB(c.env);

    // Get real swap data from the database
    const swapsResult = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .offset(offset)
      .limit(limit);

    // logger.log(`Found ${swapsResult.length} swaps for mint ${mint}`);

    // Get total count for pagination
    const totalSwapsQuery = await db
      .select({ count: sql`count(*)` })
      .from(swaps)
      .where(eq(swaps.tokenMint, mint));

    const totalSwaps = Number(totalSwapsQuery[0]?.count || 0);
    const totalPages = Math.ceil(totalSwaps / limit);

    // Format directions for better readability
    const formattedSwaps = swapsResult.map((swap) => ({
      ...swap,
      directionText: swap.direction === 0 ? "buy" : "sell",
    }));

    const response = {
      swaps: formattedSwaps,
      page,
      totalPages,
      total: totalSwaps,
    };

    return c.json(response);
  } catch (error) {
    logger.error("Error in swaps history route:", error);
    return c.json(
      {
        swaps: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Failed to fetch swap history",
      },
      500,
    );
  }
});

tokenRouter.post("/token/:mint/update", async (c) => {
  try {
    console.log("****** token/:mint/update ******\n");
    // console.log(c)
    // Get auth headers and extract from cookies
    // const authHeader = c.req.header("Authorization") || "none";
    // const publicKeyCookie = getCookie(c, "publicKey");
    // const authTokenCookie = getCookie(c, "auth_token");

    // logger.log("Token update request received");
    // logger.log("Authorization header:", authHeader);
    // logger.log("Auth cookie present:", !!authTokenCookie);
    // logger.log("PublicKey cookie:", publicKeyCookie);

    // Require authentication
    const user = c.get("user");
    // console.log("User from context:", user);

    if (!user) {
      logger.error("Authentication required - no user in context");

      // For development purposes, if in dev mode and there's a publicKey in the body, use that
      if (c.env.NODE_ENV === "development") {
        try {
          const body = await c.req.json();
          if (body._devWalletOverride && c.env.NODE_ENV === "development") {
            logger.log(
              "DEVELOPMENT: Using wallet override:",
              body._devWalletOverride,
            );
            c.set("user", { publicKey: body._devWalletOverride });
          } else {
            return c.json({ error: "Authentication required" }, 401);
          }
        } catch (e) {
          logger.error("Failed to parse request body for dev override");
          return c.json({ error: "Authentication required" }, 401);
        }
      } else {
        return c.json({ error: "Authentication required" }, 401);
      }
    }

    // At this point user should be available - get it again after potential override
    const authenticatedUser = c.get("user");
    if (!authenticatedUser) {
      return c.json({ error: "Authentication failed" }, 401);
    }

    // User is available, continue with the request
    logger.log("Authenticated user:", authenticatedUser.publicKey);

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get request body with updated token metadata
    let body;
    try {
      body = await c.req.json();
      logger.log("Request body:", body);
    } catch (e) {
      logger.error("Failed to parse request body:", e);
      return c.json({ error: "Invalid request body" }, 400);
    }

    // Get DB connection
    const db = getDB(c.env);

    // Get the token to check permissions
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      logger.error(`Token not found: ${mint}`);
      return c.json({ error: "Token not found" }, 404);
    }

    // Log for debugging auth issues
    logger.log(`Update attempt for token ${mint}`);
    logger.log(`User wallet: ${authenticatedUser.publicKey}`);
    logger.log(`Token creator: ${tokenData[0].creator}`);

    // Try multiple ways to compare addresses
    let isCreator = false;

    try {
      // Try normalized comparison with PublicKey objects
      const normalizedWallet = new PublicKey(
        authenticatedUser.publicKey,
      ).toString();
      const normalizedCreator = new PublicKey(tokenData[0].creator).toString();

      logger.log("Normalized wallet:", normalizedWallet);
      logger.log("Normalized creator:", normalizedCreator);

      isCreator = normalizedWallet === normalizedCreator;
      logger.log("Exact match after normalization:", isCreator);

      if (!isCreator) {
        // Case-insensitive as fallback
        const caseMatch =
          authenticatedUser.publicKey.toLowerCase() ===
          tokenData[0].creator.toLowerCase();
        logger.log("Case-insensitive match:", caseMatch);
        isCreator = caseMatch;
      }
    } catch (error) {
      logger.error("Error normalizing addresses:", error);

      // Fallback to simple comparison
      isCreator = authenticatedUser.publicKey === tokenData[0].creator;
      logger.log("Simple equality check:", isCreator);
    }

    // Special dev override if enabled
    if (c.env.NODE_ENV === "development" && body._forceAdmin === true) {
      logger.log("DEVELOPMENT: Admin access override enabled");
      isCreator = true;
    }

    // Check if user is the token creator
    if (!isCreator) {
      logger.error("User is not authorized to update this token");
      return c.json(
        {
          error: "Only the token creator can update token information",
          userAddress: authenticatedUser.publicKey,
          creatorAddress: tokenData[0].creator,
        },
        403,
      );
    }

    // At this point, user is authenticated and authorized
    logger.log("User is authorized to update token");

    // Update token with the new social links
    await db
      .update(tokens)
      .set({
        website: body.website ?? tokenData[0].website,
        twitter: body.twitter ?? tokenData[0].twitter,
        telegram: body.telegram ?? tokenData[0].telegram,
        discord: body.discord ?? tokenData[0].discord,
        farcaster: body.farcaster ?? tokenData[0].farcaster,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    logger.log("Token updated successfully");
    if (tokenData[0]?.imported === 0) {
      try {
        logger.log(
          "uploading to r2",
          c.env.R2_PUBLIC_URL,
          c.env.VITE_API_URL,
          c.env.NODE_ENV,
        );
        // 1) fetch the existing JSON
        const originalUrl = tokenData[0].url;
        if (originalUrl) {
          const url = new URL(originalUrl);
          const parts = url.pathname.split("/")
          // grab only the filename portion
          const filename = parts.pop();
          if (!filename) throw new Error("Could not parse metadata filename");
          const objectKey = `token-metadata/${filename}`;
          // 2) Fetch
          const res = await fetch(originalUrl);
          const json = await res.json();
          json.properties = json.properties || {};
          json.properties.website = body.website ?? json.properties.website;
          json.properties.twitter = body.twitter ?? json.properties.twitter;
          json.properties.telegram = body.telegram ?? json.properties.telegram;
          json.properties.discord = body.discord ?? json.properties.discord;
          json.properties.farcaster = body.farcaster ?? json.properties.farcaster;
          // const stored = await c.env.R2.get(objectKey);

          // 3) Serialize back to an ArrayBuffer
          const buf = new TextEncoder().encode(JSON.stringify(json)).buffer as ArrayBuffer;

          // 4) Overwrite the same key in R2
          await c.env.R2.put(objectKey, buf, {
            httpMetadata: { contentType: "application/json" },
            customMetadata: { publicAccess: "true" },
          });


          logger.log(`Overwrote R2 object at key ${objectKey}; URL remains ${originalUrl}`);
        }
      } catch (e) {
        logger.error("Failed to re‑upload metadata JSON:", e);
      }
    }
    // Get the updated token data
    const updatedToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    // Emit WebSocket event for token update if needed
    try {
      await processTokenUpdateEvent(c.env, {
        ...updatedToken[0],
        event: "tokenUpdated",
        timestamp: new Date().toISOString(),
      });

      logger.log(`Emitted token update event for ${mint}`);
    } catch (wsError) {
      // Don't fail if WebSocket fails
      logger.error(`WebSocket error when emitting token update: ${wsError}`);
    }

    return c.json({
      success: true,
      message: "Token information updated successfully",
      token: updatedToken[0],
    });
  } catch (error) {
    logger.error("Error updating token:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

tokenRouter.get("/token/:mint/agents", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const db = getDB(c.env);
    const agents = await db
      .select()
      .from(tokenAgents) // Ensure tokenAgents is imported and defined in schema
      .where(eq(tokenAgents.tokenMint, mint))
      .orderBy(tokenAgents.createdAt);

    // ** ADD Log: Check the agents data before sending **
    logger.log(
      `[GET /agents] Found agents for mint ${mint}:`,
      JSON.stringify(agents),
    );

    // Return in the format expected by the frontend { agents: [...] }
    return c.json({ agents: agents || [] });
  } catch (error) {
    logger.error("Error fetching token agents:", error);
    return c.json({ agents: [], error: "Failed to fetch agents" }, 500);
  }
});

tokenRouter.post("/token/:mint/agents", async (c) => {
  try {
    // Require authentication (check user variable set by middleware)
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("Agent creation attempt failed: Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    const { twitterUserId } = body;

    if (!twitterUserId || typeof twitterUserId !== "string") {
      return c.json({ error: "Missing or invalid twitterUserId" }, 400);
    }

    const db = getDB(c.env);

    // Check if this Twitter user is already linked to this specific token
    const existingAgent = await db
      .select()
      .from(tokenAgents)
      .where(
        and(
          eq(tokenAgents.tokenMint, mint),
          eq(tokenAgents.twitterUserId, twitterUserId),
        ),
      )
      .limit(1);

    if (existingAgent && existingAgent.length > 0) {
      logger.warn(
        `Agent creation attempt failed: Twitter user ${twitterUserId} already linked to token ${mint}`,
      );
      return c.json(
        {
          error: "This Twitter account is already connected to this token.",
          agent: existingAgent[0],
        },
        409, // Conflict
      );
    }

    // --- Placeholder: Fetch Twitter Username and Image ---
    // TODO: Replace with actual Twitter API call using credentials/client
    const twitterUserName = twitterUserId;
    const twitterImageUrl = "/default-avatar.png";
    logger.warn(
      `Placeholder: Using mock Twitter data for user ID ${twitterUserId}`,
    );
    // try {
    //   const twitterProfile = await fetchTwitterProfile(c.env, twitterUserId);
    //   twitterUserName = twitterProfile.username;
    //   twitterImageUrl = twitterProfile.profile_image_url;
    // } catch (twitterError) {
    //    logger.error(`Failed to fetch Twitter profile for ${twitterUserId}:`, twitterError);
    //    // Decide how to handle - proceed with placeholder or error out?
    // }
    // --- End Placeholder ---

    // Check if the owner is the token creator to mark as official
    const tokenData = await db
      .select({ creator: tokens.creator })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    const isOfficial =
      tokenData &&
      tokenData.length > 0 &&
      tokenData[0].creator === user.publicKey;

    const newAgentData = {
      id: crypto.randomUUID(), // Generate ID if not auto-generated by DB
      tokenMint: mint,
      ownerAddress: user.publicKey, // The Solana address of the user linking the account
      twitterUserId: twitterUserId,
      twitterUserName: twitterUserName,
      twitterImageUrl: twitterImageUrl,
      official: isOfficial ? 1 : 0,
      createdAt: new Date().toISOString(), // Set timestamp if not auto-set by DB
    };

    // This insert call now expects 'official' as a number (0 or 1)
    const result = await db
      .insert(tokenAgents)
      .values(newAgentData)
      .returning();

    if (!result || result.length === 0) {
      throw new Error("Failed to insert new agent into database.");
    }

    const newAgent = result[0];
    logger.log(
      `Successfully created agent link: Token ${mint}, Twitter ${twitterUserName}, Owner ${user.publicKey}`,
    );

    // TODO: Emit WebSocket event for new agent?

    return c.json(newAgent, 201); // Return the newly created agent with 201 status
  } catch (error) {
    logger.error("Error creating token agent:", error);
    // Handle potential database unique constraint errors more gracefully if needed
    if (
      error instanceof Error &&
      error.message.includes("duplicate key value violates unique constraint")
    ) {
      return c.json(
        {
          error:
            "This Twitter account might already be linked elsewhere or a database conflict occurred.",
        },
        409,
      );
    }
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create agent",
      },
      500,
    );
  }
});

tokenRouter.delete("/token/:mint/agents/:agentId", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("Agent deletion attempt failed: Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    const agentId = c.req.param("agentId"); // Assuming agentId is the unique ID (UUID)

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }
    // Basic UUID check (simplified)
    if (!agentId || agentId.length < 30) {
      return c.json({ error: "Missing or invalid agent ID" }, 400);
    }

    const db = getDB(c.env);

    // Find the agent to check ownership
    const agentToDelete = await db
      .select()
      .from(tokenAgents)
      .where(and(eq(tokenAgents.id, agentId), eq(tokenAgents.tokenMint, mint)))
      .limit(1);

    if (!agentToDelete || agentToDelete.length === 0) {
      return c.json(
        { error: "Agent not found or does not belong to this token" },
        404,
      );
    }

    // Check if the authenticated user is the owner of this agent link
    if (agentToDelete[0].ownerAddress !== user.publicKey) {
      logger.warn(
        `Agent deletion attempt failed: User ${user.publicKey} tried to delete agent ${agentId} owned by ${agentToDelete[0].ownerAddress}`,
      );
      return c.json(
        { error: "You can only remove agents you have connected." },
        403, // Forbidden
      );
    }

    // Delete the agent
    const result = await db
      .delete(tokenAgents)
      .where(eq(tokenAgents.id, agentId))
      .returning({ id: tokenAgents.id }); // Return ID to confirm deletion

    if (!result || result.length === 0) {
      // This might happen if the agent was deleted between the select and delete calls
      logger.warn(
        `Agent ${agentId} not found during deletion, possibly already deleted.`,
      );
      return c.json({ error: "Agent not found during deletion attempt" }, 404);
    }

    logger.log(
      `Successfully deleted agent: ID ${agentId}, Token ${mint}, User ${user.publicKey}`,
    );

    // TODO: Emit WebSocket event for agent removal?

    return c.json({ success: true, message: "Agent removed successfully" });
  } catch (error) {
    logger.error("Error deleting token agent:", error);
    return c.json({ error: "Failed to remove agent" }, 500);
  }
});

tokenRouter.post("/token/:mint/connect-twitter-agent", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("Agent connection attempt failed: Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    const { accessToken, userId } = body;

    if (!accessToken || !userId) {
      return c.json({ error: "Missing Twitter credentials" }, 400);
    }

    // Step 1: Attempt to fetch Twitter user info
    let twitterUserId = userId;
    let twitterUserName = `user_${userId.substring(0, 5)}`;
    let twitterImageUrl = "/default-avatar.png";

    try {
      // Try to fetch user profile
      logger.log(`Fetching Twitter profile for user ID: ${userId}`);
      const profileResponse = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        logger.log("Twitter profile data:", profileData);

        if (profileData.data && profileData.data.id) {
          twitterUserId = profileData.data.id;
          // If username is available, use it
          if (profileData.data.username) {
            twitterUserName = `@${profileData.data.username}`;
          }

          // Handle profile image if available
          if (profileData.data.profile_image_url) {
            // Store original Twitter URL temporarily
            const originalImageUrl = profileData.data.profile_image_url;

            // Replace '_normal' with '_400x400' to get a larger image
            const largeImageUrl = originalImageUrl.replace(
              "_normal",
              "_400x400",
            );

            try {
              // Fetch the image
              const imageResponse = await fetch(largeImageUrl);
              if (imageResponse.ok) {
                // Generate a unique filename
                const imageId = crypto.randomUUID();
                const imageKey = `twitter-images/${imageId}.jpg`;

                // Get the image as arrayBuffer
                const imageBuffer = await imageResponse.arrayBuffer();

                // Store in R2 if available
                if (c.env.R2) {
                  await c.env.R2.put(imageKey, imageBuffer, {
                    httpMetadata: {
                      contentType: "image/jpeg",
                      cacheControl: "public, max-age=31536000", // Cache for 1 year
                    },
                  });

                  // Set the URL to our cached version
                  twitterImageUrl = `${c.env.API_URL || c.env.VITE_API_URL}/api/twitter-image/${imageId}`;
                  logger.log(
                    `Cached Twitter profile image at: ${twitterImageUrl}`,
                  );
                } else {
                  // If R2 is not available, use the original URL
                  twitterImageUrl = largeImageUrl;
                  logger.log("R2 not available, using original Twitter URL");
                }
              } else {
                logger.warn(
                  `Failed to fetch Twitter profile image: ${imageResponse.status}`,
                );
                // Fall back to the original URL
                twitterImageUrl = originalImageUrl;
              }
            } catch (imageError) {
              logger.error("Error caching Twitter profile image:", imageError);
              // Fall back to the original URL
              twitterImageUrl = originalImageUrl;
            }
          }
        }
      } else {
        logger.warn(
          `Twitter profile fetch failed with status: ${profileResponse.status}`,
        );
        // Continue with default values - we don't want to fail the agent creation
        // just because we couldn't get user details
      }
    } catch (profileError) {
      logger.error("Error fetching Twitter profile:", profileError);
      // Continue with default values
    }

    // Step 2: Check if this Twitter user is already connected to this token
    const db = getDB(c.env);
    const existingAgent = await db
      .select()
      .from(tokenAgents)
      .where(
        and(
          eq(tokenAgents.tokenMint, mint),
          eq(tokenAgents.twitterUserId, twitterUserId),
        ),
      )
      .limit(1);

    if (existingAgent && existingAgent.length > 0) {
      logger.warn(
        `Agent creation attempt failed: Twitter user ${twitterUserId} already linked to token ${mint}`,
      );
      return c.json(
        {
          error: "This Twitter account is already connected to this token.",
          agent: existingAgent[0],
        },
        409, // Conflict
      );
    }

    // Step 3: Check if the owner is the token creator to mark as official
    const tokenData = await db
      .select({ creator: tokens.creator })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    const isOfficial =
      tokenData &&
      tokenData.length > 0 &&
      tokenData[0].creator === user.publicKey;

    // Step 4: Create new agent
    const newAgentData = {
      id: crypto.randomUUID(),
      tokenMint: mint,
      ownerAddress: user.publicKey,
      twitterUserId: twitterUserId,
      twitterUserName: twitterUserName,
      twitterImageUrl: twitterImageUrl,
      official: isOfficial ? 1 : 0,
      createdAt: new Date().toISOString(),
    };

    const result = await db
      .insert(tokenAgents)
      .values(newAgentData)
      .returning();

    if (!result || result.length === 0) {
      throw new Error("Failed to insert new agent into database.");
    }

    const newAgent = result[0];
    logger.log(
      `Successfully created agent link: Token ${mint}, Twitter ${twitterUserName}, Owner ${user.publicKey}`,
    );

    // TODO: Emit WebSocket event for new agent?

    return c.json(newAgent, 201);
  } catch (error) {
    logger.error("Error connecting Twitter agent:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to connect Twitter agent",
      },
      500,
    );
  }
});

tokenRouter.get("/twitter-image/:imageId", async (c) => {
  try {
    // Get the imageId from params
    const imageId = c.req.param("imageId");
    if (!imageId) {
      return c.json({ error: "Image ID parameter is required" }, 400);
    }

    // Ensure R2 is available
    if (!c.env.R2) {
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // Construct the full storage key
    const imageKey = `twitter-images/${imageId}.jpg`;

    // Fetch the image from R2
    const object = await c.env.R2.get(imageKey);

    if (!object) {
      return c.json({ error: "Twitter profile image not found" }, 404);
    }

    // Get the content type and data
    const contentType = object.httpMetadata?.contentType || "image/jpeg";
    const data = await object.arrayBuffer();

    // Set CORS headers for browser access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    // Return the image with appropriate headers
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": object.size.toString(),
        "Cache-Control": "public, max-age=31536000", // Cache for 1 year
        ...corsHeaders,
      },
    });
  } catch (error) {
    logger.error("Error serving Twitter profile image:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to serve Twitter profile image",
      },
      500,
    );
  }
});

tokenRouter.get("/token/:mint/check-balance", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get wallet address from query parameter
    const address = c.req.query("address");
    if (!address || address.length < 32 || address.length > 44) {
      return c.json({ error: "Invalid wallet address" }, 400);
    }

    // Check if we're in local mode (which will check both networks)
    const mode = c.req.query("mode");
    const isLocalMode = mode === "local";

    logger.log(
      `Checking token balance for ${address} on ${mint}, mode: ${isLocalMode ? "local" : "standard"}`,
    );

    const db = getDB(c.env);

    // Check token holders table
    const holderQuery = await db
      .select()
      .from(tokenHolders)
      .where(
        and(eq(tokenHolders.mint, mint), eq(tokenHolders.address, address)),
      )
      .limit(1);

    // Get token for decimals information
    const tokenQuery = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    const token = tokenQuery[0];

    // If token doesn't exist in our database but we're in local mode,
    // try to check the blockchain directly if LOCAL_DEV is enabled
    if (!token && (isLocalMode || (c.env as any).LOCAL_DEV === "true")) {
      logger.log(
        `Token ${mint} not found in database, but in local/dev mode, trying blockchain lookup`,
      );
      return await checkBlockchainTokenBalance(c, mint, address, isLocalMode);
    }

    // If token doesn't exist in our database and not in local mode
    if (!token) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Check if user is the token creator
    const isCreator = token.creator === address;

    // Default decimals for most tokens
    const decimals = 6;

    if (holderQuery.length > 0) {
      // User is in the token holders table
      const holder = holderQuery[0];
      const balance = holder.amount / Math.pow(10, decimals);

      return c.json({
        balance,
        percentage: holder.percentage,
        isCreator,
        mint,
        address,
        lastUpdated: holder.lastUpdated,
      });
    } else if (isCreator) {
      // User is the creator but not in holders table (might not have any tokens)
      return await checkBlockchainTokenBalance(c, mint, address, false);
    } else {
      // User is not in holders table and is not the creator
      // This likely means they have no tokens
      return c.json({
        balance: 0,
        percentage: 0,
        isCreator: false,
        mint,
        address,
      });
    }
  } catch (error) {
    logger.error(`Error checking token balance: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

tokenRouter.post("/vanity-keypair", async (c) => {
  console.log("keypairs");
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("[POST /vanity-keypair] Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }
    logger.log(`[POST /vanity-keypair] Authenticated user: ${user.publicKey}`);

    const db = getDB(c.env);

    // Parse request body (optional - could include specific vanity requirements or force generation flag)
    const requestOptions = {
      forceGenerate: false,
    };

    try {
      const body = await c.req.json();
      logger.log(`[POST /vanity-keypair] Request body:`, body);
      requestOptions.forceGenerate = !!body.forceGenerate;
    } catch (e) {
      // If body can't be parsed, just use default options
      logger.log(
        `[POST /vanity-keypair] No request body or invalid JSON, using defaults`,
      );
    }

    // Check actual count of available keypairs for debugging
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(vanityKeypairs)
      .where(eq(vanityKeypairs.used, 0));

    const totalCount = countResult[0]?.count || 0;
    logger.log(
      `[POST /vanity-keypair] Database reports ${totalCount} unused keypairs available`,
    );

    // Try to find an unused keypair
    const keypairs = await db
      .select()
      .from(vanityKeypairs)
      .where(eq(vanityKeypairs.used, 0))
      .limit(1);

    console.log("keypairs", keypairs);

    if (!keypairs || keypairs.length === 0) {
      // Double-check if there's a discrepancy between count and actual query
      if (totalCount > 0) {
        logger.warn(
          `[POST /vanity-keypair] Discrepancy: Count reports ${totalCount} keypairs but query found none!`,
        );

        // Try a more direct query to check for any issue
        const allKeypairs = await db
          .select({ id: vanityKeypairs.id, used: vanityKeypairs.used })
          .from(vanityKeypairs)
          .limit(5);

        console.log("allKeypairs", allKeypairs);

        logger.log(
          `[POST /vanity-keypair] Sample of up to 5 keypairs from database: ${JSON.stringify(allKeypairs)}`,
        );
      }

      // Generate a new keypair as fallback
      logger.log(
        "[POST /vanity-keypair] Falling back to generating a new keypair",
      );
      const generatedKeypair = Keypair.generate();
      const newKeypair = {
        id: generatedKeypair.publicKey.toString(),
        address: generatedKeypair.publicKey.toString(),
        secretKey: Buffer.from(generatedKeypair.secretKey).toString("base64"),
        createdAt: Math.floor(Date.now() / 1000).toString(),
        used: 1, // Mark as used immediately since we're using it now
      };

      // Insert the generated keypair
      await db.insert(vanityKeypairs).values(newKeypair);
      logger.log(`[POST /vanity-keypair] Inserted new generated keypair`);

      // Return the generated keypair
      return c.json({
        id: newKeypair.id,
        publicKey: newKeypair.address,
        secretKey: Array.from(generatedKeypair.secretKey),
        message: "Successfully generated a new keypair",
      });
    }

    const keypair = keypairs[0];

    console.log("**** *keypair is", keypair);

    if (!keypair) {
      // generate a regular keypair
      const kp = Keypair.generate();
      return c.json({
        id: crypto.randomUUID(),
        publicKey: kp.publicKey,
        secretKey: Object.values(kp.secretKey),
        message: "Successfully reserved a vanity keypair",
      });
    }

    logger.log(
      `[POST /vanity-keypair] Found unused keypair: ${keypair.address}`,
    );

    // Mark this keypair as used
    await db
      .update(vanityKeypairs)
      .set({
        used: 1,
      })
      .where(eq(vanityKeypairs.id, keypair.id));

    logger.log(
      `[POST /vanity-keypair] Marked keypair ${keypair.address} as used by ${user.publicKey}`,
    );

    // Convert secretKey from base64 to byte array for the client
    let secretKeyBytes;
    try {
      // The secretKey is stored as base64 string in the database
      const base64Key = keypair.secretKey;

      // Decode it to get a binary buffer
      const secretKeyBuffer = Buffer.from(base64Key, "base64");

      // Convert to array format expected by solana/web3.js
      secretKeyBytes = Array.from(secretKeyBuffer);

      logger.log(
        `[POST /vanity-keypair] Successfully converted secretKey to array of length ${secretKeyBytes.length}`,
      );
    } catch (keyError) {
      logger.error(
        `[POST /vanity-keypair] Error converting secretKey: ${keyError}`,
      );
      return c.json({ error: "Failed to process keypair" }, 500);
    }

    // Return the keypair details with consistent field naming (publicKey instead of address)
    return c.json({
      id: keypair.id,
      publicKey: keypair.address,
      secretKey: secretKeyBytes,
      message: "Successfully reserved a vanity keypair",
    });
  } catch (error) {
    logger.error("[POST /vanity-keypair] Error processing request:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process vanity keypair request",
      },
      500,
    );
  }
});

// Check for generated images on a token by mint address in R2
tokenRouter.get("/check-generated-images/:mint", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    if (!c.env.R2) {
      logger.error("R2 storage is not available");
      return c.json({ images: [] }, 200); // Return empty list if R2 not available
    }

    // Check for generated images in R2
    const generationImagesPrefix = `generations/${mint}/`;
    logger.log(
      `Checking for generated images with prefix: ${generationImagesPrefix}`,
    );

    // Try to list objects with the given prefix
    try {
      const objects = await c.env.R2.list({
        prefix: generationImagesPrefix,
        limit: 10, // Reasonable limit
      });

      // Extract the filenames from the full paths
      const imageKeys = objects.objects.map((obj) => {
        const parts = obj.key.split("/");
        return parts[parts.length - 1]; // Get just the filename
      });

      logger.log(
        `Found ${imageKeys.length} generated images for token ${mint}`,
      );

      // For security, we don't return the full image keys but just the existence
      // and let the frontend construct URLs based on naming conventions
      return c.json({
        success: true,
        hasImages: imageKeys.length > 0,
        count: imageKeys.length,
        pattern:
          imageKeys.length > 0
            ? `generations/${mint}/gen-[1-${imageKeys.length}].jpg`
            : null,
      });
    } catch (error) {
      logger.error(`Error listing generated images: ${error}`);
      return c.json({
        success: false,
        hasImages: false,
        error: "Failed to list generated images",
      });
    }
  } catch (error) {
    logger.error(`Error checking generated images: ${error}`);
    return c.json(
      {
        success: false,
        hasImages: false,
        error: "Server error",
      },
      500,
    );
  }
});

export default tokenRouter;
