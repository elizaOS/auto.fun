// test raydium pool info

import { Connection, PublicKey } from '@solana/web3.js';
import { initSdk } from './lib/raydium-config';
import dotenv from 'dotenv';

dotenv.config();

async function testPoolInfo(poolId: string) {
  try {
    // Initialize Raydium SDK
    const raydium = await initSdk({ loadToken: true });
    
    console.log('Testing pool info for poolId:', poolId);

    // Get pool info
    let poolInfo;
    
    if (raydium.cluster === 'devnet') {
      const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
      poolInfo = data.poolInfo;
      console.log('Devnet Pool Info:', {
        lpMint: poolInfo.lpMint.toString(),
        baseVault: poolInfo.baseVault.toString(),
        quoteVault: poolInfo.quoteVault.toString(),
        baseAmount: poolInfo.baseAmount.toString(),
        quoteAmount: poolInfo.quoteAmount.toString()
      });
    } else {
      const data = await raydium.api.fetchPoolById({ ids: poolId });
      if (!data || data.length === 0) {
        throw new Error('Pool info not found');
      }
      poolInfo = data[0];
      console.log('Mainnet Pool Info:', {
        poolInfo,
        lpMint: poolInfo.lpMint.address,
        // baseVault: poolInfo.baseVault.address,
        // quoteVault: poolInfo.quoteVault.address,
        mintAmountA: poolInfo.mintAmountA,
        mintAmountB: poolInfo.mintAmountB
      });
    }

    if (!poolInfo) {
      throw new Error('Failed to get pool info');
    }

  } catch (error) {
    console.error('Error testing pool info:', error);
  }
}

// Example usage:
testPoolInfo('JB7NoAfAAYZivmeMo2kYSgiDoTaCgPmFmQusY3BZFkt9');
