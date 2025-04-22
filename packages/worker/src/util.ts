import { BN, Program } from "@coral-xyz/anchor";
import { fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey, Umi } from "@metaplex-foundation/umi";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
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
import { getDB, Token, tokens } from "./db";
import { Env } from "./env";
import { calculateTokenMarketData, getSOLPrice } from "./mcap";
import { initSolanaConfig, getProgram } from "./solana";
import { Autofun } from "./target/types/autofun";
import { getWebSocketClient } from "./websocket-client";
import { ExternalToken } from "./externalToken";

export const SEED_BONDING_CURVE = "bonding_curve";
export const SEED_CONFIG = "config";

import { Wallet } from "./tokenSupplyHelpers/customWallet";
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
export interface TokenMetadataJson {
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

const FEE_BASIS_POINTS = 10000;

// Helper function to get WebSocket server for emitting events
export const getIoServer = (env?: Partial<Env>) => {
  // Create a mock env with needed properties
  const fullEnv = {
    NETWORK: env?.NETWORK || "mainnet",
  } as Env;
  return getWebSocketClient(fullEnv);
};

/**
 * Fetches metadata with exponential backoff retry
 */
export const fetchMetadataWithBackoff = async (
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

export async function getTxIdAndCreatorFromTokenAddress(
  tokenAddress: string,
  env?: Env,
) {
  console.log(`tokenAddress: ${tokenAddress}`);

  // Get a Solana config with the right environment
  const solanaConfig = initSolanaConfig(env);

  const transactionHistory =
    await solanaConfig.connection.getSignaturesForAddress(
      new PublicKey(tokenAddress),
    );

  if (transactionHistory.length > 0) {
    const tokenCreationTxId =
      transactionHistory[transactionHistory.length - 1].signature;
    const transactionDetails =
      await solanaConfig.connection.getTransaction(tokenCreationTxId);

    if (
      transactionDetails &&
      transactionDetails.transaction &&
      transactionDetails.transaction.message
    ) {
      // The creator address is typically the first account in the transaction's account keys
      const creatorAddress =
        transactionDetails.transaction.message.accountKeys[0].toBase58();
      return { tokenCreationTxId, creatorAddress };
    }
  }

  throw new Error(`No transaction found for token address: ${tokenAddress}`);
}

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
      lastSupplyUpdate: new Date(),
      createdAt: new Date(),
      lastUpdated: new Date(),
    };

    getIoServer(env).to("global").emit("newToken", { mint: tokenData.mint });

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

export const createConfigTx = async (
  admin: PublicKey,

  newConfig: any,

  connection: Connection,
  program: Program<Autofun>,
) => {
  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId,
  );

  console.log("configPda: ", configPda.toBase58());

  // Create compute budget instructions
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units: 300000, // Increase compute units
  });

  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 50000, // Add priority fee
  });

  // Get the transaction
  const configTx = await program.methods
    .configure(newConfig)
    .accounts({
      payer: admin,
    })
    .transaction();

  // Add compute budget instructions at the beginning
  configTx.instructions = [
    modifyComputeUnits,
    addPriorityFee,
    ...configTx.instructions,
  ];

  configTx.feePayer = admin;
  configTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return configTx;
};

export const swapTx = async (
  user: PublicKey,
  token: PublicKey,
  amount: number,
  style: number,
  slippageBps: number = 100,
  connection: Connection,
  program: Program<Autofun>,
) => {
  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId,
  );
  const configAccount = await program.account.config.fetch(configPda);
  const [bondingCurvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_BONDING_CURVE), token.toBytes()],
    program.programId,
  );
  const curve = await program.account.bondingCurve.fetch(bondingCurvePda);

  // Apply platform fee
  const feePercent =
    style === 1
      ? Number(configAccount.platformSellFee)
      : Number(configAccount.platformBuyFee);
  const adjustedAmount = Math.floor(
    (amount * (FEE_BASIS_POINTS - feePercent)) / FEE_BASIS_POINTS,
  );

  // Calculate expected output
  let estimatedOutput;

  console.log("curve.reserveToken.toNumber()", curve.reserveToken.toNumber());
  console.log("adjustedAmount", adjustedAmount);
  console.log(
    "curve.reserveLamport.toNumber()",
    curve.reserveLamport.toNumber(),
  );
  console.log("feePercent", feePercent);

  if (style === 0) {
    // Buy
    estimatedOutput = calculateAmountOutBuy(
      curve.reserveToken.toNumber(),
      adjustedAmount,
      curve.reserveLamport.toNumber(),
      feePercent,
      300,
    );
  } else {
    // Sell
    estimatedOutput = calculateAmountOutSell(
      curve.reserveLamport.toNumber(),
      adjustedAmount,
      feePercent,
      curve.reserveToken.toNumber(),
      300,
    );
  }

  // Apply slippage to estimated output
  const minOutput = new BN(
    Math.floor((estimatedOutput * (10000 - slippageBps)) / 10000),
  );

  const deadline = Math.floor(Date.now() / 1000) + 120;

  const tx = await program.methods
    .swap(new BN(amount), style, minOutput, new BN(deadline))
    .accounts({
      teamWallet: configAccount.teamWallet,
      user,
      tokenMint: token,
    })
    .transaction();

  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
};

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
export const getMainnetRpcUrl = (env: any) => {
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
export const getDevnetRpcUrl = (env: any) => {
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

// Generate a logger that works with Cloudflare Workers
export const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args),
  warn: (...args: any[]) => console.warn(...args),
  info: (...args: any[]) => console.log(...args),
};

// Execute a transaction
export const execTx = async (
  transaction: Transaction,
  connection: Connection,
  payer: any,
  commitment: "confirmed" | "finalized" = "confirmed",
) => {
  try {
    //  Sign the transaction with payer wallet
    const signedTx = await payer.signTransaction(transaction);

    // Serialize, send and confirm the transaction
    const rawTransaction = signedTx.serialize();

    logger.log(await connection.simulateTransaction(signedTx));

    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 2,
      preflightCommitment: "processed",
    });

    logger.log(
      `https://solscan.io/tx/${txid}?cluster=custom&customUrl=${connection.rpcEndpoint}`,
    );

    const confirmed = await connection.confirmTransaction(txid, commitment);

    if (confirmed.value.err) {
      logger.error("err ", confirmed.value.err);
    }

    return txid;
  } catch (e) {
    console.log(e);
  }
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

export const getATokenAccountsNeedCreate = async (
  connection: Connection,
  walletAddress: PublicKey,
  owner: PublicKey,
  nfts: PublicKey[],
) => {
  const instructions: TransactionInstruction[] = [];
  const destinationAccounts: PublicKey[] = [];
  for (const mint of nfts) {
    const destinationPubkey = getAssociatedTokenAccount(owner, mint);
    let response = await connection.getAccountInfo(destinationPubkey);
    if (!response) {
      const createATAIx = createAssociatedTokenAccountInstruction(
        destinationPubkey,
        walletAddress,
        owner,
        mint,
      );
      instructions.push(createATAIx);
    }
    destinationAccounts.push(destinationPubkey);
    if (walletAddress != owner) {
      const userAccount = getAssociatedTokenAccount(walletAddress, mint);
      response = await connection.getAccountInfo(userAccount);
      if (!response) {
        const createATAIx = createAssociatedTokenAccountInstruction(
          userAccount,
          walletAddress,
          walletAddress,
          mint,
        );
        instructions.push(createATAIx);
      }
    }
  }
  return {
    instructions,
    destinationAccounts,
  };
};

export function splitIntoLines(text?: string): string[] | undefined {
  if (!text) return undefined;
  return text
    .split("\n")
    .map((line) => line.trim().replace("\n", ""))
    .filter((line) => line.length > 0);
}

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
  token: { volume24h?: number | null; holderCount?: number | null },
  maxVolume: number,
  maxHolders: number,
): number {
  const normalizedMaxVolume = maxVolume || 1;
  const normalizedMaxHolders = maxHolders || 1;

  const volume = token.volume24h || 0;
  const holders = token.holderCount || 0;

  return (
    (volume / normalizedMaxVolume) * 0.7 +
    (holders / normalizedMaxHolders) * 0.3
  );
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
