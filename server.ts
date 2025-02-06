import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { 
  Cluster,
  ComputeBudgetProgram,
  Connection, 
  Keypair, 
  PublicKey,
} from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from '@coral-xyz/anchor';
import mongoose from 'mongoose';
import { withdrawTx } from './lib/scripts';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { execTx, execWithdrawTx } from './lib/util';
import * as fs from 'fs';
import { SEED_BONDING_CURVE } from './lib/constant';
import { Serlaunchalot } from './target/types/serlaunchalot';
import { getMint, NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getAssociatedTokenAccount } from './lib/util';
import { initSdk, txVersion } from './lib/raydium-config';
import { fetchDigitalAsset, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey, Umi } from '@metaplex-foundation/umi';
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { clusterApiUrl } from '@solana/web3.js'
import {
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID,
  DEV_CREATE_CPMM_POOL_PROGRAM,
  getCpmmPdaAmmConfigId,
  ApiV3PoolInfoStandardItemCpmm,
  CpmmKeys,
} from '@raydium-io/raydium-sdk-v2';
import cors from 'cors';
import { Token, Swap, Fee, TokenMetadataJson } from './schemas';
import routes from './routes';
import { updateHoldersCache } from './routes';
import { VanityKeypairGenerator } from './keypairgen';
import { logger } from './logger';
import { metadataCache } from './cache';
import { getSOLPrice } from './mcap';
import PQueue from 'p-queue';

const VALID_PROGRAM_ID = new Set(
  [
    CREATE_CPMM_POOL_PROGRAM.toBase58(), 
    DEV_CREATE_CPMM_POOL_PROGRAM.toBase58()
  ])
const isValidCpmm = (id: string) => VALID_PROGRAM_ID.has(id)

// Init Vanity Keypair Generator
const keypairGen = new VanityKeypairGenerator();

const TOKEN_DECIMALS = Number(process.env.DECIMALS || 6);

// Express server setup
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({
  origin: ["https://autofun-frontend.vercel.app", "https://autofun.vercel.app", "http://localhost:3000", "http://localhost:3420", "https://auto.fun", "*"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));
app.use(express.json());

// HTTP server and Socket.IO instance
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    // origin: process.env.FRONTEND_URL || "http://localhost:3420", // Allow frontend URL
    origin: "*", // Just allow everything for now
    methods: ["GET", "POST"],
    allowedHeaders: ["*"]
  },
  allowEIO3: true
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    logger.log('Client disconnected:', socket.id);
  });

  // Subscribe to specific token updates
  socket.on('subscribe', (token: string) => {
    socket.join(`token-${token}`);
    logger.log(`Client ${socket.id} subscribed to token ${token}`);
  });

  // Subscribe to global updates
  socket.on('subscribeGlobal', () => {
    socket.join('global');
    logger.log(`Client ${socket.id} subscribed to global updates`);
  });

  // Unsubscribe from token updates
  socket.on('unsubscribe', (token: string) => {
    socket.leave(`token-${token}`);
    logger.log(`Client ${socket.id} unsubscribed from token ${token}`);
  });
});

// Global variables
let solConnection: Connection = null;
let program: Program<Serlaunchalot> = null;
let payer: NodeWallet = null;

interface PriceFeedInfo {
  price: number,
  timestamp: Date,
  volume: number
}

type CandlePrice = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
};

const fetchMetadataWithBackoff = async (umi: Umi, tokenAddress: string) => {
  const cached = metadataCache.get(tokenAddress);
  if (cached) return cached;

  const maxRetries = 15;
  const baseDelay = 500;
  const maxDelay = 30000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const metadata = await fetchDigitalAsset(umi, publicKey(tokenAddress));
      metadataCache.set(tokenAddress, metadata);
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

class TokenMonitor {
  private connection: Connection;
  private program: Program<Serlaunchalot>;
  private wallet: NodeWallet;
  private isMonitoring: boolean = false;
  private umi: Umi;
  private queue: PQueue;
  private holderUpdateQueue: PQueue;

  constructor(
    connection: Connection, 
    program: Program<Serlaunchalot>,
    walletKey: string
  ) {
    this.connection = connection;
    this.program = program;
    
    const walletKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(walletKey)),
      { skipValidation: true }
    );
    this.wallet = new NodeWallet(walletKeypair);
    this.umi = createUmi(process.env.SOLANA_RPC_URL)
    .use(mplTokenMetadata());
    this.queue = new PQueue({ 
      concurrency: 5,  // Process 5 tokens at a time
      interval: 1000,  // Time window in ms
      intervalCap: 10  // Max operations per interval
    });
    this.holderUpdateQueue = new PQueue({ 
      concurrency: 3,  // Process 3 tokens at a time
      interval: 1000,  // Time window in ms
      intervalCap: 5   // Max operations per interval
    });
  }

  private async startHolderUpdates() {
    setInterval(async () => {
      try {
        // Get all active and migrated tokens
        const tokens = await Token.find({
          status: { $in: ['active', 'migrated', 'locked'] },
          lastUpdated: { 
            $lt: new Date(Date.now() - 5 * 60 * 1000) // Older than 5 minutes
          }
        }).select('mint');

        // Queue updates for each token
        tokens.forEach(token => {
          this.holderUpdateQueue.add(async () => {
            try {
              await updateHoldersCache(token.mint);
            } catch (error) {
              logger.error(`Failed to update holders for ${token.mint}:`, error);
            }
          });
        });
      } catch (error) {
        logger.error('Error in holder update interval:', error);
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    this.startHolderUpdates();

     // Subscribe to program logs
     this.connection.onLogs(
      this.program.programId,
      async (logs) => {
        if (logs.err) return;
        
        // Look for swap logs
        const mintLog = logs.logs.find(log => log.includes("Mint:"));
        const swapLog = logs.logs.find(log => log.includes("Swap:"));
        const reservesLog = logs.logs.find(log => log.includes("Reserves:"));
        const feeLog = logs.logs.find(log => log.includes("fee:"));
        const swapeventLog = logs.logs.find(log => log.includes("SwapEvent:"));
        const newTokenLog = logs.logs.find(log => log.includes("NewToken:"));

        const completeEventLog = logs.logs.find(log => log.includes("curve is completed"));

        if (completeEventLog) {
          try {
            const mintAddress = mintLog.split("Mint:")[1].trim().replace(/[",)]/g, '');
            const [bondingCurvePda] = PublicKey.findProgramAddressSync(
              [Buffer.from(SEED_BONDING_CURVE), new PublicKey(mintAddress).toBytes()],
              this.program.programId
            );
        
            // Add to queue for processing with retries
            this.queue.add(async () => {
              const maxRetries = 15;
              for (let i = 0; i < maxRetries; i++) {
                try {
                  const bondingCurveAccount = await this.program.account.bondingCurve.fetch(bondingCurvePda);
                  if (!bondingCurveAccount.isCompleted) {
                    if (i === maxRetries - 1) {
                      logger.error('Failed to confirm curve completion after max retries');
                      return;
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                  }
        
                  const token = await Token.findOne({ mint: mintAddress });

                  if (token) {
                    logger.log('Bonding Curve CompleteEvent confirmed for token:', token.mint);
                    const existingToken = await Token.findOne({ mint: mintAddress });
                    if (existingToken && ['migrating', 'withdrawn', 'migrated', 'locked'].includes(existingToken.status)) {
                        logger.log(`Token ${mintAddress} is already in process: ${existingToken.status}`);
                        return;
                    }
                    
                    // Only update to migrating if we pass the status check
                    await Token.findOneAndUpdate(
                        { mint: mintAddress },
                        { 
                            status: 'migrating',
                            lastUpdated: new Date()
                        },
                        { new: true }
                    );
                    await this.handleMigration(token);
                  }

                  break;

                } catch (error) {
                  if (i === maxRetries - 1) {
                    logger.error('Error processing complete event after retries:', error);
                  }
                }
              }
            });
          } catch (error) {
            logger.error('Error queueing complete event:', error);
          }
        }

        if (newTokenLog) {
          try {
            const [tokenAddress, creatorAddress] = newTokenLog.split(" ").slice(-2).map(s => s.replace(/[",)]/g, ''));
            
            let metadata;

            metadata = await fetchMetadataWithBackoff(this.umi, tokenAddress);
        
            const [bondingCurvePda] = PublicKey.findProgramAddressSync(
              [Buffer.from(SEED_BONDING_CURVE), new PublicKey(tokenAddress).toBytes()],
              this.program.programId
            );
        
            const bondingCurveAccount = await this.program.account.bondingCurve.fetchNullable(
              bondingCurvePda
            );

            let additionalMetadata: TokenMetadataJson | null = null;
            try {
              const response = await fetch(metadata.metadata.uri);
              additionalMetadata = await response.json() as TokenMetadataJson;
            } catch (error) {
              logger.error(`Failed to fetch IPFS metadata from URI: ${metadata.metadata.uri}`, error);
            }

            const TOKEN_DECIMALS = Number(process.env.DECIMALS || 6);

            const solPrice = await getSOLPrice();

            const currentPrice = Number(bondingCurveAccount.reserveToken) > 0 ? 
              (Number(bondingCurveAccount.reserveLamport) / 1e9) / 
              (Number(bondingCurveAccount.reserveToken) / Math.pow(10, TOKEN_DECIMALS))
              : 0;

            const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
            const tokenPriceUSD = currentPrice > 0 ? 
                (tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)) : 0;

            const marketCapUSD = (Number(process.env.TOKEN_SUPPLY) / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;
        
            const token = await Token.findOneAndUpdate(
              { mint: tokenAddress },
              {
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
                reserveAmount: Number(bondingCurveAccount.reserveToken.toNumber()),
                reserveLamport: Number(bondingCurveAccount.reserveLamport.toNumber()),
                virtualReserves: Number(process.env.VIRTUAL_RESERVES),
                liquidity:
                  ((Number(bondingCurveAccount.reserveLamport) / 1e9 * solPrice) + 
                  (Number(bondingCurveAccount.reserveToken) / Math.pow(10, TOKEN_DECIMALS) * tokenPriceUSD)),
                currentPrice: (Number(bondingCurveAccount.reserveLamport) / 1e9) / (Number(bondingCurveAccount.reserveToken) / Math.pow(10, TOKEN_DECIMALS)),
                marketCapUSD: marketCapUSD,
                tokenPriceUSD: tokenPriceUSD,
                solPriceUSD: solPrice,
                curveProgress: ((Number(bondingCurveAccount.reserveLamport) - Number(process.env.VIRTUAL_RESERVES))  / (Number(process.env.CURVE_LIMIT) - Number(process.env.VIRTUAL_RESERVES))) * 100,
                curveLimit: Number(process.env.CURVE_LIMIT),
                status: 'active',
                createdAt: new Date(),
                lastUpdated: new Date(),
                priceChange24h: 0,
                price24hAgo: tokenPriceUSD,
                volume24h: 0,
                inferenceCount: 0,
                // TODO: store txId here
              },
              { 
                upsert: true,
                new: true 
              }
            );

            logger.log(`Found new token: ${tokenAddress}`);
            io.to('global').emit('newToken', token);
        
          } catch (error) {
            logger.error('Error processing new token log:', error);
          }
        }

        if (logs.err || !logs.logs.some(log => log.includes("success"))) {
          return;
        }

        if (mintLog || swapLog || reservesLog || feeLog) {
          try {
            // Parse logs
            const mintAddress = mintLog.split("Mint:")[1].trim().replace(/[",)]/g, '');
            const [user, direction, amount] = swapLog.split(" ").slice(-3).map(s => s.replace(/[",)]/g, ''));
            const [reserveToken, reserveLamport] = reservesLog.split(" ").slice(-2).map(s => s.replace(/[",)]/g, ''));
            const feeAmount = feeLog.split("fee:")[1].trim().replace(/[",)]/g, '');
            const [usr, dir, amountOut] = swapeventLog.split(" ").slice(-3).map(s => s.replace(/[",)]/g, ''));

            // Fetch token data to get decimals
            const tokenMint = new PublicKey(mintAddress);
            const tokenData = await getMint(this.connection, tokenMint);
    
            const SOL_DECIMALS = 9;
            const TOKEN_DECIMALS = tokenData.decimals; // get the token decimals from token data


            if (logs.signature && logs.signature.match(/^1{64}$/)) {
              logger.log('Invalid signature:', logs.signature);
              return;
            }

            // Create swap record
            const swap = await Swap.findOneAndUpdate(
              { txId: logs.signature },
              {
                tokenMint: mintAddress,
                user: user,
                direction: parseInt(direction),
                type: direction === "1" ? "sell" : "buy",
                amountIn: Number(amount),
                amountOut: Number(amountOut),
                price: direction === "1" ? 
                  (Number(amountOut) / Math.pow(10, SOL_DECIMALS)) / (Number(amount) / Math.pow(10, TOKEN_DECIMALS)) : // Sell price (SOL/token)
                  (Number(amount) / Math.pow(10, SOL_DECIMALS)) / (Number(amountOut) / Math.pow(10, TOKEN_DECIMALS)),  // Buy price (SOL/token)
                txId: logs.signature,
                // reserveTokenAfter: reserveToken,
                // reserveLamportAfter: reserveLamport
              },
              { 
                upsert: true,
                new: true 
              }
            );

            const solPrice = await getSOLPrice();

            const currentPrice = (Number(reserveLamport) / 1e9) / 
              (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS));

            const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
            const tokenPriceUSD = currentPrice > 0 ? 
                (tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)) : 0;

            const marketCapUSD = (Number(process.env.TOKEN_SUPPLY) / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;

            logger.log('reserveLamport', Number(reserveLamport));
            logger.log('reserveToken', Number(reserveToken));
            logger.log('currentPrice', currentPrice);
            logger.log('tokenPriceUSD', tokenPriceUSD);
            logger.log('marketCapUSD', marketCapUSD);

            const existingToken = await Token.findOne({ mint: mintAddress });
            const priceChange = existingToken?.price24hAgo 
              ? ((tokenPriceUSD - existingToken.price24hAgo) / existingToken.price24hAgo) * 100
              : 0;

            const token = await Token.findOneAndUpdate(
              { mint: mintAddress },
              {
                reserveAmount: Number(reserveToken), // WIP
                reserveLamport: Number(reserveLamport), // WIP
                currentPrice: (Number(reserveLamport) / 1e9) / (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS)),
                liquidity:  
                  (Number(reserveLamport) / 1e9 * solPrice) + 
                  (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS) * tokenPriceUSD),
                marketCapUSD: marketCapUSD,
                tokenPriceUSD: tokenPriceUSD,
                solPriceUSD: solPrice,
                curveProgress: ((Number(reserveLamport) - Number(process.env.VIRTUAL_RESERVES))  / (Number(process.env.CURVE_LIMIT) - Number(process.env.VIRTUAL_RESERVES))) * 100,
                lastUpdated: new Date(),
                $inc: { 
                  volume24h: direction === "1" 
                    ? (Number(amount) / Math.pow(10, TOKEN_DECIMALS) * tokenPriceUSD)
                    : (Number(amountOut) / Math.pow(10, TOKEN_DECIMALS) * tokenPriceUSD)
                },
                $set: {
                  priceChange24h: priceChange,
                  // Only update price24hAgo if it's been more than 24 hours or doesn't exist
                  ...((!existingToken?.price24hAgo || 
                     Date.now() - (existingToken?.lastPriceUpdate?.getTime() || 0) > 24 * 60 * 60 * 1000) && { // 24 hours
                    price24hAgo: tokenPriceUSD,
                    lastPriceUpdate: new Date()
                  })
                }
              },
              { 
                upsert: true,
                new: true 
              }
            );
            
            // Create fee record
            const fee = await Fee.findOneAndUpdate(
              { txId: logs.signature },
              {
                tokenMint: mintAddress,
                user: user,
                direction: parseInt(direction),
                type: 'swap',
                tokenAmount: '0',
                solAmount: feeAmount,
                feeAmount: feeAmount,
                txId: logs.signature,
              },
              { 
                upsert: true,
                new: true 
              }
            );

            const ONE_DAY = 24 * 60 * 60 * 1000;
            const lastVolumeReset = token.lastVolumeReset || new Date(0);

            if (Date.now() - lastVolumeReset.getTime() > ONE_DAY) {
              await Token.findOneAndUpdate(
                { mint: mintAddress },
                { 
                  volume24h: 0,
                  lastVolumeReset: new Date()
                }
              );
            }

            const ONE_HOUR = 60 * 60 * 1000;
            const lastPriceUpdate = token.lastPriceUpdate || new Date(0);

            if (Date.now() - lastPriceUpdate.getTime() > ONE_HOUR) {
              await Token.findOneAndUpdate(
                { mint: mintAddress },
                { 
                  price24hAgo: tokenPriceUSD,
                  lastPriceUpdate: new Date(),
                  priceChange24h: token.price24hAgo ? 
                    ((tokenPriceUSD - token.price24hAgo) / token.price24hAgo) * 100 : 
                    0
                }
              );
            }

            // Update holders cache on after a swap
            this.holderUpdateQueue.add(async () => {
              try {
                await updateHoldersCache(mintAddress);
              } catch (error) {
                logger.error(`Failed to update holders after swap for ${mintAddress}:`, error);
              }
            });

            // Emit the new swap data
            io.to(`token-${swap.tokenMint}`).emit('newSwap', {
              tokenMint: swap.tokenMint,
              user: swap.user,
              price: swap.price,
              type: swap.type,
              amountIn: swap.amountIn,
              amountOut: swap.amountOut,
              timestamp: swap.timestamp,
              direction: swap.direction,
              txId: swap.txId
            });

            // Get properly formatted candle data using same logic as /chart GET endpoint
            const latestCandle = await getLatestCandle(swap.tokenMint, swap);

            // Emit the new candle data
            io.to(`token-${swap.tokenMint}`).emit('newCandle', latestCandle);

            // Emit the new token data
            io.to(`token-${swap.tokenMint}`).emit('updateToken', token);

            logger.log(`Recorded swap and fee: ${logs.signature}`);
          } catch (error) {
            logger.error('Error processing swap logs:', error);
          }
        }
      },
      'confirmed'
    );
  }

  // WIP TODO: For Admin/Team only to claim locked liquidity fees from minted Raydium NFT (Burn and Earn)
  private async harvestLockedLiquidity(token: any) {
    try {
      logger.log(`Harvesting locked liquidity fees for token ${token.mint}`);
      
      const raydium = await initSdk({ loadToken: true });
  
      // Get pool info
      let poolInfo: ApiV3PoolInfoStandardItemCpmm;
      if (raydium.cluster === 'devnet') {
        const data = await raydium.api.fetchPoolById({ ids: token.marketId });
        poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
        if (!isValidCpmm(poolInfo.programId)) throw new Error('target pool is not CPMM pool');
      } else {
        const data = await raydium.cpmm.getPoolInfoFromRpc(token.marketId);
        poolInfo = data.poolInfo;
      }
  
      // Harvest the locked LP
      const { execute: harvestExecute } = await raydium.cpmm.harvestLockLp({
        poolInfo,
        nftMint: new PublicKey(token.nftMinted), // locked nft mint (mint to address from lock liquidity)
        lpFeeAmount: new BN(99999999),
        txVersion,
      })
  
      const { txId: harvestTxId } = await harvestExecute({ sendAndConfirm: true });
      logger.log('LP token fees harvested with txId:', harvestTxId);
  
      // Update token status
      token.harvestedAt = new Date();
      token.status = 'harvested';
      await token.save();
  
      logger.log(`Harvesting completed for token ${token.mint}`);
    } catch (error) {
      logger.error(`Harvesting failed for token ${token.mint}:`, error);
    }
  }

  private async handleMigration(token: any) {
    let retryCount = 0;
    try {

      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
        units: 300000 // Higher units for complex operation
      });
      
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 50000 // Higher priority fee for mainnet
      });
      
      // 1. Withdraw funds
      logger.log('Withdrawing funds...');
      const withdrawTransaction = await withdrawTx(
        this.wallet.publicKey,
        new PublicKey(token.mint),
        this.connection,
        this.program
      );

      // Add compute budget instructions
      withdrawTransaction.instructions = [
        modifyComputeUnits,
        addPriorityFee,
        ...withdrawTransaction.instructions
      ];

      // const withdrawTxId = await execWithdrawTx(withdrawTransaction, this.connection, this.wallet);
      const { signature: withdrawTxId, logs: withdrawTxLogs } = await execWithdrawTx(
        withdrawTransaction,
        this.connection,
        this.wallet
      );
      
      // Get withdrawn amount
      const adminTokenATA = getAssociatedTokenAccount(
        this.wallet.publicKey,
        new PublicKey(token.mint)
      );
      const tokenBalance = await this.connection.getTokenAccountBalance(adminTokenATA);

      const withdrawnToken = await Token.findOneAndUpdate(
        { mint: token.mint },
        { status: 'withdrawn', withdrawnAmount: tokenBalance.value.amount, withdrawnAt: new Date(), lastUpdated: new Date() },
        { new: true }
      );

      // emit the updated token
      io.to(`token-${token.mint}`).emit('updateToken', withdrawnToken);

      // Initialize Raydium SDK
      const raydium = await initSdk({ loadToken: true });

      // Get token mint info
      // TokenA
      const mintA = await raydium.token.getTokenInfo(token.mint)
      // TokenB
      const mintB = await raydium.token.getTokenInfo(NATIVE_MINT)

      // Get fee configs from Raydium
      const feeConfigs = await raydium.api.getCpmmConfigs();

      // For devnet, update fee config IDs
      if (raydium.cluster === 'devnet') {
        feeConfigs.forEach((config) => {
          config.id = getCpmmPdaAmmConfigId(
            DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, 
            config.index
          ).publicKey.toBase58();
        });
      }

      logger.log('feeConfigs', feeConfigs);

      let feeConfig;
      if (raydium.cluster === 'devnet') {
        feeConfig = feeConfigs[0]; // 0.25% fee ONLY on devnet?
      } else {
        feeConfig = feeConfigs[1]; // 1% fee on mainnet
      }

      logger.log('feeConfig selected', feeConfig);

      const FEE_PERCENTAGE = Number(process.env.FEE_PERCENTAGE || '1'); // 0.1% for migration to raydium of both token and SOL

      // logger.log("Token Amount Total", tokenBalance.value.amount);
      // logger.log("Reserve Amount Total", token.reserveAmount);

      logger.log('withdrawTxLogs', withdrawTxLogs);

      // Parse the withdrawn amounts from logs
      let withdrawnSol = 0;
      let withdrawnTokens = 0;

      withdrawTxLogs.forEach(log => {
        if (log.includes('withdraw lamports:')) {
          withdrawnSol = Number(log.replace('Program log: withdraw lamports:', '').trim());
        }
        if (log.includes('withdraw token:')) {
          withdrawnTokens = Number(log.replace('Program log: withdraw token:', '').trim());
        }
      });

      logger.log('Withdrawn amounts from program:', {
        sol: withdrawnSol,
        tokens: withdrawnTokens
      });

      // Calculate fees using the exact withdrawn amounts
      const tokenFeeAmount = new BN(withdrawnTokens)
          .muln(FEE_PERCENTAGE)
          .divn(1000)
          .toString();

      const solFeeAmount = new BN(withdrawnSol)
          .muln(FEE_PERCENTAGE)
          .divn(1000)
          .toString();

      // Use remaining amounts for pool creation
      const remainingTokens = new BN(withdrawnTokens).sub(new BN(tokenFeeAmount));
      const remainingSol = new BN(withdrawnSol).sub(new BN(solFeeAmount));

      logger.log('Pool creation amounts:', {
        remainingTokens: remainingTokens.toString(),
        remainingSol: remainingSol.toString()
      });

      // Create pool using CPMM
      logger.log('Creating Raydium CPMM pool...');

      // wait 15 seconds
      // await new Promise(resolve => setTimeout(resolve, 15000));
      // Create pool instruction
      const poolCreation = await raydium.cpmm.createPool({
        programId: (raydium.cluster === 'devnet') ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM : CREATE_CPMM_POOL_PROGRAM,
        poolFeeAccount: (raydium.cluster === 'devnet') ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC : CREATE_CPMM_POOL_FEE_ACC,
        mintA,
        mintB,
        mintAAmount: new BN(remainingTokens),
        mintBAmount: new BN(remainingSol),
        startTime: new BN(0),
        feeConfig: feeConfig,
        associatedOnly: true,
        ownerInfo: {
            useSOLBalance: true,
        },
        txVersion,
        computeBudgetConfig: {
          units: 400000,
          microLamports: 50000
        }
      });

      // // Check if pool already exists
      // const poolId = poolCreation.extInfo.address.poolId.toString();
      // try {
      //   const existingPool = await raydium.cpmm.getPoolInfoFromRpc(poolId);
      //   if (existingPool) {
      //       logger.error(`Pool already exists at address: ${poolId}`);
      //       throw new Error('Pool already exists');
      //   }
      // } catch (error) {
      //   if (error.message === 'Pool already exists') {
      //       throw error;
      //   }
      //   // If error is "account not found", continue with pool creation
      // }

      // Execute pool creation
      const { txId } = await poolCreation.execute({ sendAndConfirm: true });
      logger.log('Raydium Pool created for token:', token.mint, 'with txId:', txId);

      // Store pool creation info for later use
      const { extInfo } = poolCreation;

      // Store pool addresses
      logger.log('pool created', {
        txId,
        poolKeys: Object.keys(extInfo.address).reduce(
          (acc, cur) => ({
            ...acc,
            [cur]: extInfo.address[cur as keyof typeof extInfo.address].toString(),
          }),
          {}
        ),
      })

      // Store pool addresses
      const poolAddresses = {
        id: extInfo.address.poolId.toString(),
        lpMint: extInfo.address.lpMint.toString(),
        baseVault: extInfo.address.vaultA.toString(),
        quoteVault: extInfo.address.vaultB.toString()
      };

      // Record fees
      const fee = await Fee.findOneAndUpdate(
        { txId: txId },
        {
          tokenMint: token.mint,
          tokenAmount: tokenFeeAmount,
          solAmount: solFeeAmount,
          type: 'migration',
          txId: txId,
          timestamp: new Date()
        },
        { 
          upsert: true,
          new: true 
        }
      );

      // 4. Update final status and save market info
      const updatedToken = await Token.findOneAndUpdate(
        { mint: token.mint },
        {
          status: 'migrated',
          migratedAt: new Date(),
          marketId: poolAddresses.id,
          baseVault: poolAddresses.baseVault,
          quoteVault: poolAddresses.quoteVault,
          lastUpdated: new Date()
        },
        { 
          new: true
        }
      );

      io.to(`token-${token.mint}`).emit('updateToken', updatedToken);

      // wait 1200 seconds (20 minutes after pool creation to ensure its a fully confirmed pool)
      await new Promise(resolve => setTimeout(resolve, 1200000));

      // Get pool info for liquidity addition
      let poolInfo: ApiV3PoolInfoStandardItemCpmm;
      let poolKeys: CpmmKeys | undefined;

      const poolId = updatedToken.marketId;

      // const poolId = extInfo.address.poolId.toString();
      logger.log('Fetching pool info for poolId:', poolId);

      // Retry mechanism for getting pool info over course of one hour every 5 minutes?
      const MAX_RETRIES = 12; // Try for up to 1 hour (12 * 5 minutes)
      let retryCount = 0;
      let poolFound = false;
      
      while (!poolFound && retryCount < MAX_RETRIES) {
        try {
          logger.log(`Attempt ${retryCount + 1}/${MAX_RETRIES} to fetch pool info for poolId: ${poolId}`);
          
          if (raydium.cluster === 'devnet') {
            const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
            poolInfo = data.poolInfo;
            poolKeys = data.poolKeys;
          } else {
            const data = await raydium.api.fetchPoolById({ ids: poolId });
            if (!data || data.length === 0) {
              logger.error('Pool info not found');
              throw new Error('Pool info not found');
            }
            poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
          }
          
          // If we get here, pool was found
          poolFound = true;
          logger.log("Pool info found successfully!");
          
        } catch (error) {
          retryCount++;
          if (retryCount === MAX_RETRIES) {
            logger.error(`Failed to fetch pool to lock liquidity after ${MAX_RETRIES} attempts: ${error.message} - Pool ID: ${poolId}`);
            throw new Error(`Failed to fetch pool to lock liquidity after ${MAX_RETRIES} attempts: ${error.message} - Pool ID: ${poolId}`);
          }
          logger.log(`Pool not found yet, waiting 5 minutes before retry ${retryCount + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes
        }
      }

      // if (!poolInfo) {
      //   logger.error('Failed to get pool info after retries');
      // }

      // wait another 25 seconds
      await new Promise(resolve => setTimeout(resolve, 25000));

      logger.log("Locking LP Tokens for Raydium LP 🔒...");

      // Fetch wallet token accounts to get LP balance
      await raydium.account.fetchWalletTokenAccounts();
      const lpBalance = raydium.account.tokenAccounts.find(
        (a) => a.mint.toBase58() === poolInfo.lpMint.address
      );

      if (!lpBalance) {
        throw new Error(`No LP balance found for pool: ${poolAddresses.id}`);
      }

      logger.log("Found LP balance:", lpBalance.amount.toString());

      // devnet fix? needs testing still
      if (raydium.cluster === 'devnet') {
        const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;
      } else {
        const data = await raydium.api.fetchPoolById({ ids: poolId });
        if (!data || data.length === 0) {
          logger.error('Pool info not found');
          throw new Error('Pool info not found');
        }
        poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm;
      }

      // Get split percentages from env vars with defaults
      const PRIMARY_LOCK_PERCENTAGE = Number(process.env.PRIMARY_LOCK_PERCENTAGE || '90');
      const SECONDARY_LOCK_PERCENTAGE = Number(process.env.SECONDARY_LOCK_PERCENTAGE || '10');

      // Validate percentages = 100%
      if (PRIMARY_LOCK_PERCENTAGE + SECONDARY_LOCK_PERCENTAGE !== 100) {
        logger.error('Lock percentages must sum to 100%', {
          primary: PRIMARY_LOCK_PERCENTAGE,
          secondary: SECONDARY_LOCK_PERCENTAGE
        });
      }

      const totalLPAmount = lpBalance.amount;
      const primaryAmount = totalLPAmount.muln(PRIMARY_LOCK_PERCENTAGE).divn(100);
      const secondaryAmount = totalLPAmount.muln(SECONDARY_LOCK_PERCENTAGE).divn(100);

      logger.log("LP Token Split:", {
        total: totalLPAmount.toString(),
        primaryAmount: primaryAmount.toString(),
        secondaryAmount: secondaryAmount.toString(),
        primaryPercentage: PRIMARY_LOCK_PERCENTAGE,
        secondaryPercentage: SECONDARY_LOCK_PERCENTAGE
      });

      // Lock the LP tokens
      // const { execute: lockExecute, extInfo: lockExtInfo } = await raydium.cpmm.lockLp({
      //   poolInfo,
      //   poolKeys,
      //   lpAmount: lpBalance.amount, // Lock Full Amount, we can do less if we want
      //   withMetadata: true,
      //   txVersion,
      //   // optional fee
      //   computeBudgetConfig: {
      //     units: 300000,
      //     microLamports: 50000
      //   }
      // });

      // const { txId: lockTxId } = await lockExecute({ sendAndConfirm: true });
      // logger.log('LP tokens locked with txId:', lockTxId);
      // logger.log("NFT Minted for Burn & Earn Lock: ", lockExtInfo.nftMint.toString());
      // logger.log('lp locked', { txId: `https://explorer.solana.com/tx/${lockTxId}`, lockExtInfo })

      // First lock - Primary percentage
      const { execute: lockExecutePrimary, extInfo: lockExtInfoPrimary } = await raydium.cpmm.lockLp({
        poolInfo,
        poolKeys,
        lpAmount: primaryAmount,
        withMetadata: true,
        txVersion,
        computeBudgetConfig: {
          units: 300000,
          microLamports: 50000
        }
      });

      const { txId: lockTxIdPrimary } = await lockExecutePrimary({ sendAndConfirm: true });
      logger.log(`${PRIMARY_LOCK_PERCENTAGE}% LP tokens locked with txId:`, lockTxIdPrimary);
      logger.log(`NFT Minted for ${PRIMARY_LOCK_PERCENTAGE}% Lock:`, lockExtInfoPrimary.nftMint.toString());

      // Second lock - Secondary percentage
      const { execute: lockExecuteSecondary, extInfo: lockExtInfoSecondary } = await raydium.cpmm.lockLp({
        poolInfo,
        poolKeys,
        lpAmount: secondaryAmount,
        withMetadata: true,
        txVersion,
        computeBudgetConfig: {
          units: 300000,
          microLamports: 50000
        }
      });

      const { txId: lockTxIdSecondary } = await lockExecuteSecondary({ sendAndConfirm: true });
      logger.log(`${SECONDARY_LOCK_PERCENTAGE}% LP tokens locked with txId:`, lockTxIdSecondary);
      logger.log(`NFT Minted for ${SECONDARY_LOCK_PERCENTAGE}% Lock:`, lockExtInfoSecondary.nftMint.toString());

      // Store both lock infos in token record
      const lockedToken = await Token.findOneAndUpdate(
        { mint: token.mint },
        {
          lockId: `${lockTxIdPrimary},${lockTxIdSecondary}`,
          nftMinted: `${lockExtInfoPrimary.nftMint.toString()},${lockExtInfoSecondary.nftMint.toString()}`,
          lockedAmount: totalLPAmount.toString(),
          lockedAt: new Date(),
          status: 'locked',
          lastUpdated: new Date()
        },
        { new: true }
      );

      logger.log(`Migration completed for token ${token.mint} on Raydium CP-Swap LP: ${poolAddresses.id}`);
      io.to(`token-${token.mint}`).emit('updateToken', lockedToken);

    } catch (error) {
      // logger.error(`Migration failed for token ${token.mint}:`, error);
      // retryCount++;
      // // Check retry count and retry if under max attempts
      // if (retryCount < 4) { // 0-4 = 5 attempts total
      //   logger.log(`Retrying migration attempt ${retryCount + 1} of 5 for token ${token.mint}...`);
      //   await new Promise(resolve => setTimeout(resolve, 35000));
      //   return this.handleMigration({token});
      // }

      // Max retries reached
      logger.error(`Migration failed for token ${token.mint}`);
      logger.error(JSON.parse(error));
      
      // Handle different error types
      const errorDetails = {
        message: error.message || error.toString(),
        logs: error.logs || [],
        simulationLogs: error.simulationLogs || [],
        stack: error.stack,
        code: error.code,
        name: error.name,
        instruction: error.instruction,
        raw: typeof error === 'object' ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : error
      };

      logger.error('Migration failed:', errorDetails);
      logger.error(error.error);
      console.dir(error, { depth: null });

      await Token.findOneAndUpdate(
        { mint: token.mint },
        { status: 'migration_failed', lastUpdated: new Date() }
      );
    }
  }

  // stop() {
  //   this.isMonitoring = false;
  // }
}

// Initialize connection and program
const initializeConfig = async () => {
  solConnection = new Connection(process.env.SOLANA_RPC_URL);
  
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
    { skipValidation: true }
  );
  payer = new NodeWallet(walletKeypair);

  logger.log("Wallet Address: ", payer.publicKey.toBase58());

  anchor.setProvider(
    new anchor.AnchorProvider(solConnection, payer, {
      skipPreflight: true,
      commitment: "confirmed",
    })
  );

  // Generate the program client from IDL
  program = anchor.workspace.Serlaunchalot as Program<Serlaunchalot>;
  
  logger.log("ProgramId: ", program.programId.toBase58());
  
  return { connection: solConnection, program, wallet: payer };
};

export async function fetchPriceChartData(pairIndex: number, start: number, end: number, range: number, token: string) {
  // logger.info(`Fetching chart data for pairIndex: ${pairIndex}, start: ${start}, end: ${end}, range: ${range}, token: ${token}`);

  // load price histories from DB
  const swaps = await Swap.find(
    { 
      tokenMint: token,
      timestamp: { 
        $gte: new Date(start),
        $lte: new Date(end) 
      }
    },
    { price: 1, amountIn: 1, amountOut: 1, direction: 1, timestamp: 1 } 
  ).sort({ timestamp: 1 });
  
  // Convert to PriceFeedInfo array
  const priceFeeds: PriceFeedInfo[] = swaps
    .filter(swap => swap.price != null) // Filter out any null prices
    .map(swap => ({
      price: swap.price,
      timestamp: swap.timestamp,
      // If direction is 0 (buy), amountIn is SOL
      // If direction is 1 (sell), amountOut is SOL
      volume: swap.direction === 0 ? 
        swap.amountIn / 1e9 : // Convert from lamports to SOL
        swap.amountOut / 1e9
    }));

  if (!priceFeeds.length) return [];

  const priceHistory = priceFeeds.map((feed) => ({
    price: feed.price,
    ts: feed.timestamp.getTime() / 1000,
  })).sort((price1, price2) => price1.ts - price2.ts);

  if (!priceHistory.length) return [];

  let candlePeriod = 60; // 1 min  default
  switch (range) {
    case 1:
      // default candle period
      break;
    case 5:
      candlePeriod = 300; // 5 mins
      break;
    case 15:
      candlePeriod = 900; // 15 mins
      break;
    case 60:
      candlePeriod = 3_600; // 1 hr
      break;
    case 120:
      candlePeriod = 7_200; // 2 hrs
      break;
  }

  // convert price feed to candle price data
  let cdStart = Math.floor(priceHistory[0].ts / candlePeriod) * candlePeriod;
  let cdEnd = Math.floor(priceHistory[priceHistory.length - 1].ts / candlePeriod) * candlePeriod;

  let cdFeeds: CandlePrice[] = [];
  let pIndex = 0;
  for (let curCdStart = cdStart; curCdStart <= cdEnd; curCdStart += candlePeriod) {
    let st = priceHistory[pIndex].price;
    let hi = priceHistory[pIndex].price;
    let lo = priceHistory[pIndex].price;
    let en = priceHistory[pIndex].price;
    let vol = 0;
    let prevIndex = pIndex;
    for (; pIndex < priceHistory.length; ) {
      if (hi < priceHistory[pIndex].price) hi = priceHistory[pIndex].price;
      if (lo > priceHistory[pIndex].price) lo = priceHistory[pIndex].price;
      en = priceHistory[pIndex].price;
      vol = priceFeeds[pIndex].volume;

      // break new candle data starts
      if (priceHistory[pIndex].ts >= curCdStart + candlePeriod) break;
      pIndex++;
    }
    if (prevIndex !== pIndex)
      cdFeeds.push({
        open: st,
        high: hi,
        low: lo,
        close: en,
        volume: vol,
        time: curCdStart,
      });
  }

  return cdFeeds;
}

export async function getLatestCandle(token: string, swap: any) {
  // Get a time range that covers just this swap
  const swapTime = swap.timestamp.getTime() / 1000;
  const candlePeriod = 60; // 1 min default
  const candleStart = Math.floor(swapTime / candlePeriod) * candlePeriod;
  
  // Fetch all swaps in this candle period to properly calculate OHLCV
  const latestCandle = await fetchPriceChartData(
    0, // pairIndex
    candleStart * 1000, // start (ms)
    (candleStart + candlePeriod) * 1000, // end (ms)
    1, // 1 min range
    token
  );

  return latestCandle[0]; // Return the single candle
}

const connectDB = async (retries = 5, delay = 500) => {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 5,
        retryWrites: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log('Connected to MongoDB');
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Connection attempt ${i + 1} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Server initialization
const initServer = async () => {
  // Connect to MongoDB
  try {
    await connectDB();
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
  }

  // Initialize Solana connection and program
  const { connection, program, wallet } = await initializeConfig();
  
  // Create token monitor
  const monitor = new TokenMonitor(
    connection,
    program,
    process.env.WALLET_PRIVATE_KEY
  );

  // Start monitoring
  monitor.startMonitoring();

  // logger.log('Started vanity keypair generator');

  // Start API endpoint routing
  app.use('/', routes);

  // Start backend server and API and socket.io
  const port = process.env.PORT || 3069;

  // Start generating keypairs
  keypairGen.startGenerating();

  httpServer.listen(port, () => {
    logger.log(`Serlaunchalot Backend server, API, and socket.io running on port ${port}`);
  });
};

initServer().catch(logger.error);

// Signal Handlers
process.on('SIGTERM', () => {
  logger.log('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.log('SIGINT received, shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

export { program, solConnection as connection };