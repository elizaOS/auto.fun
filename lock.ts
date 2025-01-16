import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { Token } from './schemas';
import { initSdk, txVersion } from './lib/raydium-config';
import { logger } from './logger';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function lockLPTokens(poolId: string) {
  try {
    // Initialize Raydium SDK
    const raydium = await initSdk({ loadToken: true });

    // First find the token with case-insensitive search
    const token = await Token.findOne({ 
      marketId: { $regex: new RegExp(`^${poolId}$`, 'i') }
    });

    if (!token) {
      throw new Error(`No token found with pool ID: ${poolId}`);
    }

    // Use the correct case from the database
    const correctPoolId = token.marketId;
    logger.log('Using correct case pool ID:', correctPoolId);

    if (token.status === 'locked') {
      throw new Error(`Token ${token.mint} is already locked`);
    }

    // Get pool info using correct case
    let poolInfo;
    let poolKeys;
    
    logger.log('Fetching pool info for poolId:', correctPoolId);
    
    if (raydium.cluster === 'devnet') {
      const data = await raydium.cpmm.getPoolInfoFromRpc(correctPoolId);
      poolInfo = data.poolInfo;
      poolKeys = data.poolKeys;
    } else {
      const data = await raydium.api.fetchPoolById({ ids: correctPoolId });
      if (!data || data.length === 0) {
        throw new Error('Pool info not found');
      }
      poolInfo = data[0];
    }

    if (!poolInfo) {
      throw new Error('Failed to get pool info');
    }

    logger.log("Poool Info: ", poolInfo);

    logger.log("Fetching LP token balance...");
    await raydium.account.fetchWalletTokenAccounts();
    
    const lpBalance = raydium.account.tokenAccounts.find(
      (a) => a.mint.toBase58() === poolInfo.lpMint.address
    );

    if (!lpBalance) {
      throw new Error(`No LP balance found for pool: ${poolId}`);
    }

    logger.log("Found LP balance:", lpBalance.amount.toString());

    if (raydium.cluster === 'devnet') {
      logger.log("WARNING: No Raydium Lock Program on Devnet");
      return;
    }

    // Lock the LP tokens
    const { execute: lockExecute, extInfo: lockExtInfo } = await raydium.cpmm.lockLp({
      poolInfo,
      poolKeys,
      lpAmount: lpBalance.amount,
      withMetadata: true,
      txVersion,
      computeBudgetConfig: {
        units: 300000,
        microLamports: 50000
      }
    });

    const { txId: lockTxId } = await lockExecute({ sendAndConfirm: true });
    logger.log('LP tokens locked with txId:', lockTxId);
    logger.log("NFT Minted for Burn & Earn Lock:", lockExtInfo.nftMint.toString());

    // Update token record
    const lockedToken = await Token.findOneAndUpdate(
      { marketId: poolId },
      {
        lockId: lockTxId.toString(),
        nftMinted: lockExtInfo.nftMint.toString(),
        lockedAmount: lpBalance.amount.toString(),
        lockedAt: new Date(),
        status: 'locked',
        lastUpdated: new Date()
      },
      { new: true }
    );

    logger.log(`Successfully locked LP tokens for ${poolId}`);
    return lockedToken;

  } catch (error) {
    logger.error('Failed to lock LP tokens:', error);
    throw error;
  }
}

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

// Main execution
async function main() {
  const poolId = process.argv[2];
  if (!poolId) {
    console.error('Please provide a pool ID');
    process.exit(1);
  }

  await connectDB();
  
  try {
    await lockLPTokens(poolId);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();