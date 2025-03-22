import { BN, Program } from "@coral-xyz/anchor";
import { fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey, Umi } from '@metaplex-foundation/umi';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ComputeBudgetProgram, Connection, Keypair, ParsedAccountData, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { Autodotfun } from "./target/types/autodotfun";
import { calculateAmountOutBuy, calculateAmountOutSell } from "./tests/utils";
import { CacheService } from './cache';
import { SEED_BONDING_CURVE, SEED_CONFIG } from "./constant";
import { getDB, Token, tokenHolders, tokens } from "./db";
import { Env } from "./env";
import { calculateTokenMarketData, getSOLPrice } from './mcap';
import { initSolanaConfig } from './solana';
import { getWebSocketClient } from './websocket-client';

// Type definition for token metadata from JSON
export interface TokenMetadataJson {
  name: string;
  symbol: string;
  description: string;
  image: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  agentLink?: string;
}

const FEE_BASIS_POINTS = 10000;

// Helper function to get WebSocket server for emitting events
export const getIoServer = (env?: Partial<Env>) => {
  // Create a mock env with needed properties
  const fullEnv = {
    NETWORK: env?.NETWORK || 'mainnet',
  } as Env;
  return getWebSocketClient(fullEnv);
};

/**
 * Fetches metadata with exponential backoff retry
 */
export const fetchMetadataWithBackoff = async (umi: Umi, tokenAddress: string, env?: Env) => {
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
        maxDelay
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

export async function getTxIdAndCreatorFromTokenAddress(
  tokenAddress: string,
  env?: Env
) {
  console.log(`tokenAddress: ${tokenAddress}`);

  // Get a Solana config with the right environment
  const solanaConfig = initSolanaConfig(env);
  
  const transactionHistory = await solanaConfig.connection.getSignaturesForAddress(
    new PublicKey(tokenAddress)
  );

  if (transactionHistory.length > 0) {
    const tokenCreationTxId = transactionHistory[transactionHistory.length - 1].signature;
    const transactionDetails = await solanaConfig.connection.getTransaction(tokenCreationTxId);

    if (transactionDetails && transactionDetails.transaction && transactionDetails.transaction.message) {
      // The creator address is typically the first account in the transaction's account keys
      const creatorAddress = transactionDetails.transaction.message.accountKeys[0].toBase58(); 
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
  env?: Env
): Promise<Partial<Token>> {
  try {
    // Get a Solana config with the right environment
    const solanaConfig = initSolanaConfig(env);
    
    let metadata = await fetchMetadataWithBackoff(solanaConfig.umi, tokenAddress, env);
    logger.log(`Fetched metadata for token ${tokenAddress}:`);

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), new PublicKey(tokenAddress).toBytes()],
      solanaConfig.programId
    );

    // Fetch the account data directly using the connection instead of Anchor program
    const bondingCurveAccountInfo = await solanaConfig.connection.getAccountInfo(bondingCurvePda);
    
    // Simple structure for the bondingCurve account data
    let bondingCurveAccount = null;
    if (bondingCurveAccountInfo && bondingCurveAccountInfo.data) {
      // Parse the account data based on the expected structure
      const dataView = new DataView(bondingCurveAccountInfo.data.buffer);
      bondingCurveAccount = {
        reserveToken: BigInt(dataView.getBigUint64(8, true)), // Adjust offset based on your account structure
        reserveLamport: BigInt(dataView.getBigUint64(16, true)), // Adjust offset based on your account structure
      };
    }

    let additionalMetadata: TokenMetadataJson | null = null;
    try {
      const response = await fetch(metadata.metadata.uri);
      additionalMetadata = await response.json() as TokenMetadataJson;
    } catch (error) {
      logger.error(`Failed to fetch IPFS metadata from URI: ${metadata.metadata.uri}`, error);
    }

    // Get TOKEN_DECIMALS from env if available, otherwise use default
    const TOKEN_DECIMALS = env?.DECIMALS ? Number(env.DECIMALS) : 6;

    const solPrice = env ? await getSOLPrice(env) : await getSOLPrice();

    if(!bondingCurveAccount) {
      throw new Error(`Bonding curve account not found for token ${tokenAddress}`);
    }

    const currentPrice = Number(bondingCurveAccount.reserveToken) > 0 ? 
      (Number(bondingCurveAccount.reserveLamport) / 1e9) / 
      (Number(bondingCurveAccount.reserveToken) / Math.pow(10, TOKEN_DECIMALS))
      : 0;

    const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
    const tokenPriceUSD = currentPrice > 0 ? 
        (tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)) : 0;

    // Get TOKEN_SUPPLY from env if available, otherwise use default
    const tokenSupply = env?.TOKEN_SUPPLY ? Number(env.TOKEN_SUPPLY) : 1000000000000;
    const marketCapUSD = (tokenSupply / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;

    // Get virtual reserves from env if available, otherwise use default
    const virtualReserves = env?.VIRTUAL_RESERVES ? Number(env.VIRTUAL_RESERVES) : 100000000;
    
    // Get curve limit from env if available, otherwise use default
    const curveLimit = env?.CURVE_LIMIT ? Number(env.CURVE_LIMIT) : 1000000000;

    const tokenData: Partial<Token> = {
      id: tokenAddress, // Use mint as primary key
      name: metadata.metadata.name,
      ticker: metadata.metadata.symbol,
      url: metadata.metadata.uri,
      image: additionalMetadata?.image || '',
      twitter: additionalMetadata?.twitter || '',
      telegram: additionalMetadata?.telegram || '',
      website: additionalMetadata?.website || '',
      description: additionalMetadata?.description || '',
      mint: tokenAddress,
      creator: creatorAddress,
      reserveAmount: Number(bondingCurveAccount.reserveToken),
      reserveLamport: Number(bondingCurveAccount.reserveLamport),
      virtualReserves: virtualReserves,
      liquidity:
        ((Number(bondingCurveAccount.reserveLamport) / 1e9 * solPrice) + 
        (Number(bondingCurveAccount.reserveToken) / Math.pow(10, TOKEN_DECIMALS) * tokenPriceUSD)),
      currentPrice: (Number(bondingCurveAccount.reserveLamport) / 1e9) / (Number(bondingCurveAccount.reserveToken) / Math.pow(10, TOKEN_DECIMALS)),
      marketCapUSD: marketCapUSD,
      tokenPriceUSD: tokenPriceUSD,
      solPriceUSD: solPrice,
      curveProgress: ((Number(bondingCurveAccount.reserveLamport) - virtualReserves) / (curveLimit - virtualReserves)) * 100,
      curveLimit: curveLimit,
      status: 'active',
      priceChange24h: 0,
      price24hAgo: tokenPriceUSD,
      volume24h: 0,
      inferenceCount: 0,
      holderCount: 0,
      marketId: null,
      txId,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    getIoServer(env).to('global').emit('newToken', tokenData);

    return tokenData;
  } catch (error) {
    logger.error('Error processing new token log:', error);
    throw new Error('Error processing new token log: ' + error);
  }
}

/**
 * Updates a list of token objects with calculated market data
 * @param tokens Array of token objects from database
 * @param env Cloudflare worker environment
 * @returns Array of tokens with updated market data
 */
export async function bulkUpdatePartialTokens(tokens: Token[], env: Env): Promise<Token[]> {
  if (!tokens || tokens.length === 0) {
    return [];
  }

  // Get SOL price once for all tokens
  const solPrice = await getSOLPrice(env);
  
  // Process each token in parallel
  const updatedTokensPromises = tokens.map(token => 
    calculateTokenMarketData(token, solPrice)
  );
  
  // Wait for all updates to complete
  return Promise.all(updatedTokensPromises);
}

export const createConfigTx = async (
  admin: PublicKey,

  newConfig: any,

  connection: Connection,
  program: Program<Autodotfun>
) => {

  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId
  );

  console.log("configPda: ", configPda.toBase58());

  // Create compute budget instructions
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
    units: 300000 // Increase compute units
  });
  
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 50000 // Add priority fee
  });

  // Get the transaction
  const configTx = await program.methods
    .configure(newConfig)
    .accounts({
      payer: admin
    })
    .transaction();

  // Add compute budget instructions at the beginning
  configTx.instructions = [
    modifyComputeUnits,
    addPriorityFee,
    ...configTx.instructions
  ];

  configTx.feePayer = admin;
  configTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return configTx;
};

export const launchTokenTx = async (
  decimal: number,
  supply: number,
  reserve: number,
  name: string,
  symbol: string,
  uri: string,

  user: PublicKey,

  connection: Connection,
  program: Program<Autodotfun>,
  env?: any
) => {
    // Auth our user (register/login)
    const apiUrl = env?.API_URL || (process.env.API_URL || 'https://api.auto.fun');
    const jwt = await fetch(`${apiUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: user.toBase58()
      })
    })

    if (!jwt.ok) {
        throw new Error('Failed to register or login user wallet');
    }
    interface AuthResponse {
      user: {
        address: string;
      };
      token: string;
    }

    const jwtData = await jwt.json() as AuthResponse;

    // Get pre-generated keypair from server
    const response = await fetch(`${apiUrl}/vanity-keypair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtData.token}`
      },
      body: JSON.stringify({ address: user.toBase58() })
    });

    if (!response.ok) {
      throw new Error('Failed to get vanity keypair');
    }
    interface VanityKeypairResponse {
      address: string;
      secretKey: number[];
    }
    const { secretKey } = await response.json() as VanityKeypairResponse;
    const tokenKp = Keypair.fromSecretKey(new Uint8Array(secretKey));
 
   console.log("Using pre-generated vanity address:", tokenKp.publicKey.toBase58());

  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId
  );

  console.log("configPda: ", configPda.toBase58());
  const configAccount = await program.account.config.fetch(configPda);
  
  // Send the transaction to launch a token
  const tx = await program.methods
    .launch(
      //  launch config
      decimal,
      new BN(supply),
      new BN(reserve),

      //  metadata
      name,
      symbol,
      uri
    )
    .accounts({
      creator: user,
      token: tokenKp.publicKey,
      teamWallet: configAccount.teamWallet
    })
    .transaction();

  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  tx.sign(tokenKp);

  return tx;
}

export const swapTx = async (
  user: PublicKey,
  token: PublicKey,
  amount: number,
  style: number,
  slippageBps: number = 100,
  connection: Connection,
  program: Program<Autodotfun>
) => {
  const [configPda, _] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_CONFIG)],
    program.programId
  );
  const configAccount = await program.account.config.fetch(configPda);
  const [bondingCurvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_BONDING_CURVE), token.toBytes()],
    program.programId
  );
  const curve = await program.account.bondingCurve.fetch(bondingCurvePda);

  // Apply platform fee
  const feePercent = style === 1 ? Number(configAccount.platformSellFee) : Number(configAccount.platformBuyFee);
  const adjustedAmount = Math.floor(amount * (FEE_BASIS_POINTS - feePercent) / FEE_BASIS_POINTS);

  // Calculate expected output
  let estimatedOutput;
  if (style === 0) { // Buy
    estimatedOutput = calculateAmountOutBuy(
      curve.reserveToken.toNumber(),
      adjustedAmount, 
      curve.reserveLamport.toNumber(),
      feePercent
    );
  } else { // Sell
    estimatedOutput = calculateAmountOutSell(
      curve.reserveLamport.toNumber(),
      adjustedAmount,
      feePercent,
      curve.reserveToken.toNumber() 
    );
  }

  // Apply slippage to estimated output
  const minOutput = new BN(Math.floor(estimatedOutput * (10000 - slippageBps) / 10000));

  const deadline = Math.floor(Date.now() / 1000) + 120;

  const tx = await program.methods
    .swap(new BN(amount), style, minOutput, new BN(deadline))
    .accounts({
      teamWallet: configAccount.teamWallet,
      user,
      tokenMint: token
    })
    .transaction();

  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
}

export const withdrawTx = async (
  user: PublicKey,
  token: PublicKey,

  connection: Connection,
  program: Program<Autodotfun>
) => {

  const tx = await program.methods
    .withdraw()
    .accounts({
      admin: user,
      tokenMint: token
    })
    .transaction();

  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  return tx;
}

// Get RPC URL based on the environment
export const getRpcUrl = (env: any) => {
  return env.NETWORK === 'devnet' ? env.DEVNET_SOLANA_RPC_URL : env.MAINNET_SOLANA_RPC_URL;
}

// For compatibility with existing code that doesn't pass env
export const getLegacyRpcUrl = () => {
  // Fallback URLs if called without proper env
  return process.env.NETWORK === 'devnet' ? 
    (process.env.DEVNET_SOLANA_RPC_URL || 'https://api.devnet.solana.com') : 
    (process.env.MAINNET_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
}

// Generate a logger that works with Cloudflare Workers
export const logger = {
  log: (...args: any[]) => console.log(...args),
  error: (...args: any[]) => console.error(...args)
};

// Execute a transaction
export const execTx = async (
  transaction: Transaction,
  connection: Connection,
  payer: any,
  commitment: "confirmed" | "finalized" = 'confirmed'
) => {
  try {
    //  Sign the transaction with payer wallet
    const signedTx = await payer.signTransaction(transaction);

    // Serialize, send and confirm the transaction
    const rawTransaction = signedTx.serialize()

    logger.log(await connection.simulateTransaction(signedTx));

    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 2,
      preflightCommitment: "processed"
    });

    logger.log(`https://solscan.io/tx/${txid}?cluster=custom&customUrl=${connection.rpcEndpoint}`);

    const confirmed = await connection.confirmTransaction(txid, commitment);

    if (confirmed.value.err) {
      logger.error("err ", confirmed.value.err)
    }

    return txid;
  } catch (e) {
    console.log(e);
  }
}

export async function execWithdrawTx(
  tx: Transaction,
  connection: Connection,
  wallet: any,
  maxRetries = 1
): Promise<{ signature: string; logs: string[] }> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const signedTx = await wallet.signTransaction(tx);
      
      // Simulate before sending
      const simulation = await connection.simulateTransaction(signedTx);
      if (simulation.value.err) {
        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }

      logger.log(simulation)
      const logs = simulation.value.logs || [];
      
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: true,
        maxRetries: 2,
        preflightCommitment: 'confirmed'
      });

      if(!signature) {
        throw new Error("Transaction failed to send");
      }

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
        },
        'confirmed'
      );

      // Check if we got ProgramFailedToComplete but program actually succeeded
      if (confirmation.value.err === 'ProgramFailedToComplete' || 
          (confirmation.value.err && 
           JSON.stringify(confirmation.value.err).includes('ProgramFailedToComplete'))) {
          
          // Get transaction logs to verify actual execution
          const txInfo = await connection.getTransaction(signature, {
              maxSupportedTransactionVersion: 0
          });
          
          if (txInfo?.meta?.logMessages?.some(log => 
              log.includes(`Program success`))) {
              logger.log('Transaction succeeded despite ProgramFailedToComplete error');
              return { signature, logs: txInfo.meta.logMessages };
          }
      } else if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      logger.log('Transaction succeeded');

      return { signature, logs: logs };

    } catch (error: any) {
      lastError = error;
      logger.error(`Withdrawal execution attempt ${i + 1} failed:`, error);
      
      if (!error.message?.includes('ProgramFailedToComplete') && 
          (error.message?.includes('Transaction was not confirmed') ||
           error.message?.includes('Block height exceeded'))) {
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, i), 15000)));
          continue;
      }
      
      throw error;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

export const createAssociatedTokenAccountInstruction = (
  associatedTokenAddress: PublicKey,
  payer: PublicKey,
  walletAddress: PublicKey,
  splTokenMintAddress: PublicKey
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
  mintPk: PublicKey
): PublicKey => {
  let associatedTokenAccountPubkey = (PublicKey.findProgramAddressSync(
    [
      ownerPubkey.toBytes(),
      TOKEN_PROGRAM_ID.toBytes(),
      mintPk.toBytes(), // mint address
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  ))[0];

  return associatedTokenAccountPubkey;
}

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

export async function updateHoldersCache(env: Env, mint: string) {
    try {
      const db = getDB(env);
      const connection = new Connection(getRpcUrl(env));
      
      // Get token holders from Solana
      const accounts = await connection.getParsedProgramAccounts(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // Token program
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
        }
      );
      
      // Process accounts
      let totalTokens = 0;
      const holders = [];
      
      for (const account of accounts) {
        const parsedAccountInfo = account.account.data as ParsedAccountData;
        const tokenBalance = parsedAccountInfo.parsed?.info?.tokenAmount?.uiAmount || 0;
        
        if (tokenBalance > 0) {
          totalTokens += tokenBalance;
          holders.push({
            address: parsedAccountInfo.parsed?.info?.owner,
            amount: tokenBalance
          });
        }
      }
      
      // Calculate percentages and prepare for database
      const holderRecords = holders.map(holder => ({
        id: crypto.randomUUID(),
        mint,
        address: holder.address,
        amount: holder.amount,
        percentage: (holder.amount / totalTokens) * 100,
        lastUpdated: new Date().toISOString()
      }));
      
      // Remove old holders data
      await db.delete(tokenHolders)
        .where(eq(tokenHolders.mint, mint));
      
      // Insert new holders data
      if (holderRecords.length > 0) {
        await db.insert(tokenHolders)
          .values(holderRecords);
      }
      
      // Update the token with holder count
      await db.update(tokens)
        .set({ 
          holderCount: holderRecords.length,
          lastUpdated: new Date().toISOString()
        })
        .where(eq(tokens.mint, mint));
        
      return holderRecords.length;
    } catch (error) {
      logger.error(`Error updating holders for ${mint}:`, error);
      throw error;
    }
  }