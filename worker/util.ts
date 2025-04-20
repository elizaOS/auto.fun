import { BN, Program } from "@coral-xyz/anchor";
import { fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey, Umi } from "@metaplex-foundation/umi";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AccountInfo,
  Connection,
  ParsedAccountData,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { desc, eq, sql } from "drizzle-orm";
import { CacheService } from "./cache";
import { getDB, Token, TokenHolder, tokenHolders, tokens } from "./db";
import { Env } from "./env";
import { calculateTokenMarketData, getSOLPrice } from "./mcap";
import { getProgram, initSolanaConfig } from "./solana";
import { Autofun } from "./target/types/autofun";
import { Wallet } from "./tokenSupplyHelpers/customWallet";
import { getWebSocketClient } from "./websocket-client";

const SEED_BONDING_CURVE = "bonding_curve";

/**
 * Converts a decimal fee (e.g., 0.05 for 5%) to basis points (5% = 500 basis points)
 */
function convertToBasisPoints(feePercent: number): number {
  if (feePercent >= 1) {
    return feePercent;
  }
  return Math.floor(feePercent * 10000);
}

/**
 * Calculates the amount of SOL received when selling tokens
 */
function calculateAmountOutSell(
  reserveLamport: number,
  amount: number,
  _tokenDecimals: number,
  platformSellFee: number,
  reserveToken: number,
): number {
  const feeBasisPoints = convertToBasisPoints(platformSellFee);
  const amountBN = new BN(amount);

  // Apply fee: adjusted_amount = amount * (10000 - fee_basis_points) / 10000
  const adjustedAmount = amountBN
    .mul(new BN(10000 - feeBasisPoints))
    .div(new BN(10000));

  // For selling tokens: amount_out = reserve_lamport * adjusted_amount / (reserve_token + adjusted_amount)
  const numerator = new BN(reserveLamport).mul(adjustedAmount);
  const denominator = new BN(reserveToken).add(adjustedAmount);

  return numerator.div(denominator).toNumber();
}

function calculateAmountOutBuy(
  reserveToken: number,
  amount: number,
  _solDecimals: number,
  reserveLamport: number,
  platformBuyFee: number,
): number {
  const feeBasisPoints = convertToBasisPoints(platformBuyFee);
  const amountBN = new BN(amount);

  // Apply fee: adjusted_amount = amount * (10000 - fee_basis_points) / 10000
  const adjustedAmount = amountBN
    .mul(new BN(10000 - feeBasisPoints))
    .div(new BN(10000));

  const numerator = new BN(reserveToken).mul(adjustedAmount);
  const denominator = new BN(reserveLamport).add(adjustedAmount);

  return numerator.div(denominator).toNumber();
}

// Type definition for token metadata from JSON
interface TokenMetadataJson {
  name: string;
  symbol: string;
  description: string;
  image: string;
  twitter?: string;
  telegram?: string;
  farcaster?: string;
  website?: string;
  discord?: string;
}

// Helper function to get WebSocket server for emitting events
const getIoServer = (env?: Partial<Env>) => {
  // Create a mock env with needed properties
  const fullEnv = {
    NETWORK: env?.NETWORK || "mainnet",
  } as Env;
  return getWebSocketClient(fullEnv);
};

/**
 * Fetches metadata with exponential backoff retry
 */
const fetchMetadataWithBackoff = async (
  umi: Umi,
  tokenAddress: string,
  env?: Env,
) => {
  // If env is provided, try to get from cache first
  if (env) {
    const cacheService = new CacheService(env);
    const cached = await cacheService.getMetadata(tokenAddress);
    if (cached) return cached;
  }

  const maxRetries = 15;
  const baseDelay = 500;
  const maxDelay = 30000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const metadata = await fetchDigitalAsset(umi, publicKey(tokenAddress));

      // Cache the result if env is provided
      if (env) {
        const cacheService = new CacheService(env);
        await cacheService.setMetadata(tokenAddress, metadata, 3600); // Cache for 1 hour
      }

      return metadata;
    } catch (error: any) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.min(
        baseDelay * Math.pow(2, i) + Math.random() * 1000,
        maxDelay,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

/**
 * Creates a new token record with all required data
 */
export async function createNewTokenData(
  txId: string,
  tokenAddress: string,
  creatorAddress: string,
  env?: Env,
): Promise<Partial<Token>> {
  try {
    // Get a Solana config with the right environment
    const solanaConfig = initSolanaConfig(env);

    console.log("solanaConfig", solanaConfig);

    const metadata = await fetchMetadataWithBackoff(
      solanaConfig.umi,
      tokenAddress,
      env,
    );
    logger.log(`Fetched metadata for token ${tokenAddress}:`);

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), new PublicKey(tokenAddress).toBytes()],
      solanaConfig.programId,
    );
    if (!solanaConfig.wallet) {
      throw new Error("Wallet not found in Solana config");
    }
    const program = getProgram(
      solanaConfig.connection,
      new Wallet(solanaConfig.wallet),
      env,
    );
    // Fetch the account data directly using the connection instead of Anchor program
    const bondingCurveAccount =
      await program.account.bondingCurve.fetchNullable(bondingCurvePda);

    let additionalMetadata: TokenMetadataJson | null = null;
    try {
      const response = await fetch(metadata.metadata.uri);
      additionalMetadata = (await response.json()) as TokenMetadataJson;
    } catch (error) {
      logger.error(
        `Failed to fetch IPFS metadata from URI: ${metadata.metadata.uri}`,
        error,
      );
    }

    // Get TOKEN_DECIMALS from env if available, otherwise use default
    const TOKEN_DECIMALS = env?.DECIMALS ? Number(env.DECIMALS) : 6;

    const solPrice = env ? await getSOLPrice(env) : await getSOLPrice();

    if (!bondingCurveAccount) {
      throw new Error(
        `Bonding curve account not found for token ${tokenAddress}`,
      );
    }
    console.log("bondingCurveAccount", bondingCurveAccount);
    console.log("reserveToken", Number(bondingCurveAccount.reserveToken));
    console.log("reserveLamport", Number(bondingCurveAccount.reserveLamport));
    console.log("curveLimit", Number(bondingCurveAccount.curveLimit));

    const currentPrice =
      Number(bondingCurveAccount.reserveToken) > 0
        ? Number(bondingCurveAccount.reserveLamport) /
          1e9 /
          (Number(bondingCurveAccount.reserveToken) /
            Math.pow(10, TOKEN_DECIMALS))
        : 0;
    console.log("currentPrice", currentPrice);

    const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
    console.log("tokenPriceInSol", tokenPriceInSol);
    const tokenPriceUSD =
      currentPrice > 0
        ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
        : 0;
    console.log("tokenPriceUSD", tokenPriceUSD);

    // Get TOKEN_SUPPLY from env if available, otherwise use default
    const tokenSupply = env?.TOKEN_SUPPLY
      ? Number(env.TOKEN_SUPPLY)
      : 1000000000000000;
    const marketCapUSD =
      (tokenSupply / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;
    console.log("marketCapUSD", marketCapUSD);

    // Get virtual reserves from env if available, otherwise use default
    const virtualReserves = env?.VIRTUAL_RESERVES
      ? Number(env.VIRTUAL_RESERVES)
      : 100000000;

    // Get curve limit from env if available, otherwise use default
    const curveLimit = env?.CURVE_LIMIT
      ? Number(env.CURVE_LIMIT)
      : 113000000000;

    const tokenData: Partial<Token> = {
      id: tokenAddress, // Use mint as primary key
      name: metadata.metadata.name,
      ticker: metadata.metadata.symbol,
      url: metadata.metadata.uri,
      image: additionalMetadata?.image || "",
      twitter: additionalMetadata?.twitter || "",
      telegram: additionalMetadata?.telegram || "",
      farcaster: additionalMetadata?.farcaster || "",
      website: additionalMetadata?.website || "",
      description: additionalMetadata?.description || "",
      mint: tokenAddress,
      creator: creatorAddress,
      reserveAmount: Number(bondingCurveAccount.reserveToken),
      reserveLamport: Number(bondingCurveAccount.reserveLamport),
      virtualReserves: virtualReserves,
      liquidity:
        (Number(bondingCurveAccount.reserveLamport) / 1e9) * solPrice +
        (Number(bondingCurveAccount.reserveToken) /
          Math.pow(10, TOKEN_DECIMALS)) *
          tokenPriceUSD,
      currentPrice:
        Number(bondingCurveAccount.reserveLamport) /
        1e9 /
        (Number(bondingCurveAccount.reserveToken) /
          Math.pow(10, TOKEN_DECIMALS)),
      marketCapUSD: marketCapUSD,
      tokenPriceUSD: tokenPriceUSD,
      solPriceUSD: solPrice,
      curveProgress:
        ((Number(bondingCurveAccount.reserveLamport) - virtualReserves) /
          (curveLimit - virtualReserves)) *
        100,
      curveLimit: curveLimit,
      status: "active",
      priceChange24h: 0,
      price24hAgo: tokenPriceUSD,
      volume24h: 0,
      inferenceCount: 0,
      holderCount: 0,
      marketId: null,
      txId,
      tokenSupply: tokenSupply.toString(),
      tokenSupplyUiAmount: tokenSupply / Math.pow(10, TOKEN_DECIMALS),
      tokenDecimals: TOKEN_DECIMALS,
      lastSupplyUpdate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    getIoServer(env).to("global").emit("newToken", tokenData);

    return tokenData;
  } catch (error) {
    logger.error("Error processing new token log:", error);
    throw new Error("Error processing new token log: " + error);
  }
}

/**
 * Updates a list of token objects with calculated market data
 * @param tokens Array of token objects from database
 * @param env Cloudflare worker environment
 * @returns Array of tokens with updated market data
 */
export async function bulkUpdatePartialTokens(
  tokens: Token[],
  env: Env,
): Promise<Token[]> {
  if (!tokens || tokens.length === 0) {
    return [];
  }

  // Get SOL price once for all tokens
  const solPrice = await getSOLPrice(env);

  // Process each token in parallel
  const updatedTokensPromises = tokens.map((token) =>
    calculateTokenMarketData(token, solPrice, env),
  );

  // Wait for all updates to complete
  return Promise.all(updatedTokensPromises);
}

export const withdrawTx = async (
  user: PublicKey,
  token: PublicKey,

  connection: Connection,
  program: Program<Autofun>,
) => {
  const tx = await program.methods
    .withdraw()
    .accounts({
      admin: user,
      tokenMint: token,
    })
    .transaction();

  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
};

// Get RPC URL based on the environment
export const getRpcUrl = (env: any, forceMainnet: boolean = false) => {
  // Extract the base URL and ensure we use the correct API key
  let baseUrl;

  if (forceMainnet || env.NETWORK === "devnet") {
    baseUrl = "https://devnet.helius-rpc.com/";
  } else {
    // Default to mainnet
    baseUrl = "https://mainnet.helius-rpc.com/";
  }

  // Use API key from environment, ensuring it's applied correctly
  const apiKey =
    env.NETWORK === "devnet"
      ? env.DEVNET_SOLANA_RPC_URL?.split("api-key=")[1] ||
        "67ea9085-1406-4db8-8872-38ac77950d7a"
      : env.MAINNET_SOLANA_RPC_URL?.split("api-key=")[1] ||
        "67ea9085-1406-4db8-8872-38ac77950d7a";

  const result = `${baseUrl}?api-key=${apiKey}`;

  logger.log(
    `getRpcUrl called with NETWORK=${env.NETWORK}, returning: ${result}`,
  );
  return result;
};

// Get mainnet RPC URL regardless of environment setting
const getMainnetRpcUrl = (env: any) => {
  // Extract base URL and API key
  const baseUrl = "https://mainnet.helius-rpc.com/";
  const apiKey =
    env.MAINNET_SOLANA_RPC_URL?.split("api-key=")[1] ||
    env.VITE_MAINNET_RPC_URL?.split("api-key=")[1] ||
    "67ea9085-1406-4db8-8872-38ac77950d7a";

  const mainnetUrl = `${baseUrl}?api-key=${apiKey}`;

  logger.log(`getMainnetRpcUrl returning: ${mainnetUrl}`);
  return mainnetUrl;
};

// Get devnet RPC URL regardless of environment setting
const getDevnetRpcUrl = (env: any) => {
  // Extract base URL and API key
  const baseUrl = "https://devnet.helius-rpc.com/";
  const apiKey =
    env.DEVNET_SOLANA_RPC_URL?.split("api-key=")[1] ||
    env.VITE_DEVNET_RPC_URL?.split("api-key=")[1] ||
    "67ea9085-1406-4db8-8872-38ac77950d7a";

  const devnetUrl = `${baseUrl}?api-key=${apiKey}`;

  logger.log(`getDevnetRpcUrl returning: ${devnetUrl}`);
  return devnetUrl;
};

const getTimestamp = () => {
  return new Date().toISOString();
};

export const logger = {
  log: (...args: any[]) => {
    console.log(`[${getTimestamp()}]`, ...args);
  },
  info: (...args: any[]) => {
    console.info(`[${getTimestamp()}]`, ...args);
  },
  warn: (...args: any[]) => {
    console.warn(`[${getTimestamp()}]`, ...args);
  },
  error: (...args: any[]) => {
    console.error(`[${getTimestamp()}]`, ...args);
  },
};

export async function execWithdrawTx(
  tx: Transaction,
  connection: Connection,
  wallet: any,
  maxRetries = 1,
): Promise<{ signature: string; logs: string[] }> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const signedTx = await wallet.signTransaction(tx);

      // Simulate before sending
      const simulation = await connection.simulateTransaction(signedTx);
      if (simulation.value.err) {
        throw new Error(
          `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
        );
      }

      logger.log(simulation);
      const logs = simulation.value.logs || [];

      const signature = await connection.sendRawTransaction(
        signedTx.serialize(),
        {
          skipPreflight: true,
          maxRetries: 2,
          preflightCommitment: "confirmed",
        },
      );

      if (!signature) {
        throw new Error("Transaction failed to send");
      }

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: (await connection.getLatestBlockhash())
            .lastValidBlockHeight,
        },
        "confirmed",
      );

      // Check if we got ProgramFailedToComplete but program actually succeeded
      if (
        confirmation.value.err === "ProgramFailedToComplete" ||
        (confirmation.value.err &&
          JSON.stringify(confirmation.value.err).includes(
            "ProgramFailedToComplete",
          ))
      ) {
        // Get transaction logs to verify actual execution
        const txInfo = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (
          txInfo?.meta?.logMessages?.some((log) =>
            log.includes(`Program success`),
          )
        ) {
          logger.log(
            "Transaction succeeded despite ProgramFailedToComplete error",
          );
          return { signature, logs: txInfo.meta.logMessages };
        }
      } else if (confirmation.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
        );
      }

      logger.log("Transaction succeeded");

      return { signature, logs: logs };
    } catch (error: any) {
      lastError = error;
      logger.error(`Withdrawal execution attempt ${i + 1} failed:`, error);

      if (
        !error.message?.includes("ProgramFailedToComplete") &&
        (error.message?.includes("Transaction was not confirmed") ||
          error.message?.includes("Block height exceeded"))
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000 * Math.pow(2, i), 15000)),
        );
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

export const createAssociatedTokenAccountInstruction = (
  associatedTokenAddress: PublicKey,
  payer: PublicKey,
  walletAddress: PublicKey,
  splTokenMintAddress: PublicKey,
) => {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
    { pubkey: walletAddress, isSigner: false, isWritable: false },
    { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];
  return new TransactionInstruction({
    keys,
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([]),
  });
};

export const getAssociatedTokenAccount = (
  ownerPubkey: PublicKey,
  mintPk: PublicKey,
): PublicKey => {
  const associatedTokenAccountPubkey = PublicKey.findProgramAddressSync(
    [
      ownerPubkey.toBytes(),
      TOKEN_PROGRAM_ID.toBytes(),
      mintPk.toBytes(), // mint address
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];

  return associatedTokenAccountPubkey;
};

/**
 * Gets the maximum values needed for featured sorting
 *
 * @param db Database instance
 * @returns Object containing maxVolume and maxHolders values for normalization
 */
export async function getFeaturedMaxValues(db: any) {
  // Get max values for normalization with a subquery
  try {
    const maxValues = await db
      .select({
        maxVolume: sql`MAX(COALESCE(${tokens.volume24h}, 0))`,
        maxHolders: sql`MAX(COALESCE(${tokens.holderCount}, 0))`,
      })
      .from(tokens)
      .where(sql`${tokens.status} != 'pending'`);

    // Extract max values, default to 1 to avoid division by zero
    return {
      maxVolume: Number(maxValues[0]?.maxVolume) || 1,
      maxHolders: Number(maxValues[0]?.maxHolders) || 1,
    };
  } catch (error) {
    console.error("Error getting max values for featured sort:", error);
    return { maxVolume: 1, maxHolders: 1 }; // Default values on error
  }
}

/**
 * Creates a SQL expression for calculating the weighted featured score
 *
 * @param maxVolume Maximum volume value for normalization
 * @param maxHolders Maximum holder count for normalization
 * @returns SQL expression for calculating the weighted score
 */
export function getFeaturedScoreExpression(
  maxVolume: number,
  maxHolders: number,
) {
  // Use provided max values, defaulting to 1 to avoid division by zero
  const normalizedMaxVolume = maxVolume || 1;
  const normalizedMaxHolders = maxHolders || 1;

  // Return the weighted score SQL expression
  return sql`(
    (COALESCE(${tokens.volume24h}, 0) / ${normalizedMaxVolume} * 0.7) + 
    (COALESCE(${tokens.holderCount}, 0) / ${normalizedMaxHolders} * 0.3)
  )`;
}

/**
 * Calculates the weighted score for a token using JavaScript
 * This function matches the SQL logic for consistency
 *
 * @param token Token object with volume24h and holderCount properties
 * @param maxVolume Maximum volume value for normalization
 * @param maxHolders Maximum holder count for normalization
 * @returns Calculated weighted score
 */
export function calculateFeaturedScore(
  token: {
    ticker: string;
    featured: number | null;
    imported: number | null;
    volume24h?: number | null;
    holderCount?: number | null;
    createdAt: string;
  },
  maxVolume: number,
  maxHolders: number,
): number {
  const normalizedMaxVolume = maxVolume || 1;
  const normalizedMaxHolders = maxHolders || 1;

  const volume = token.volume24h || 0;
  const holders = token.holderCount || 0;

  const isSpecialToken =
    token.ticker.includes("ai16z") ||
    token.ticker.includes("degenai") ||
    token.ticker.includes("pxl");

  const isFeatured = token.featured && token.featured > 0;

  const importFactor = isSpecialToken
    ? 2.5
    : isFeatured
      ? 2
      : token.imported && token.imported > 0
        ? 0.1
        : 1;

  console.log("token.imported", token);
  console.log("isFeatured", isFeatured);
  console.log("isSpecialToken", isSpecialToken);

  // Calculate base score (volume + holders)
  const baseScore =
    (volume / normalizedMaxVolume) * 0.7 +
    (holders / normalizedMaxHolders) * 0.3;

  // Calculate time weight
  let timeWeight = 1; // Default weight
  try {
    const creationDate = new Date(token.createdAt);
    const now = new Date();
    const ageInMillis = now.getTime() - creationDate.getTime();

    // Ensure age is not negative (for tokens created slightly in the future due to clock skew)
    if (ageInMillis > 0) {
      const ageInYears = ageInMillis / (1000 * 60 * 60 * 24 * 365.25);
      // Apply exponential decay: weight = 0.5 ^ ageInYears
      timeWeight = Math.pow(0.1, ageInYears);
    }
  } catch (error) {
    logger.error(
      `Error calculating time weight for token ${token.ticker}:`,
      error,
    );
    // Keep default weight of 1 if parsing fails
  }

  // Apply import factor and time weight
  return baseScore * importFactor * timeWeight;
}

/**
 * Applies a weighted sort for the "featured" tokens
 * Uses 70% weight on volume24h and 30% weight on holderCount
 *
 * @param tokensQuery Current tokens query that needs sorting applied
 * @param maxVolume Maximum volume value for normalization
 * @param maxHolders Maximum holder count for normalization
 * @param sortOrder Sort direction ("asc" or "desc")
 * @returns Updated tokens query with the weighted sorting applied
 */
export function applyFeaturedSort(
  tokensQuery: any,
  maxVolume: number,
  maxHolders: number,
  sortOrder: string,
) {
  const featuredScore = getFeaturedScoreExpression(maxVolume, maxHolders);

  if (sortOrder.toLowerCase() === "desc") {
    return tokensQuery.orderBy(desc(featuredScore));
  } else {
    return tokensQuery.orderBy(featuredScore);
  }
}

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
        tokenData[0] as any,
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
export async function processTokenInfo(
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
        logger.log(
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
export async function checkBlockchainTokenBalance(
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

    // *** START INSERT: Check if the token exists before proceeding ***
    const tokenExists = await db
      .select({ id: tokens.id })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenExists || tokenExists.length === 0) {
      logger.warn(
        `[updateHoldersCache] Token with mint ${mint} not found in the database. Skipping holder update.`,
      );
      return 0; // Return 0 as no holders can be updated
    }
    // *** END INSERT ***

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

          console.log("batch", batch);

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
