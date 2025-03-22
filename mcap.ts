import { Connection, PublicKey } from '@solana/web3.js';
import { PythHttpClient, getPythProgramKeyForCluster, PythCluster, getPythClusterApiUrl } from '@pythnetwork/client';
import { logger } from './logger';
import PQueue from 'p-queue';
import { initSdk } from './lib/raydium-config';
import { Token } from './schemas';
import {processMissedEvents} from './missedEvents';

const PYTHNET_CLUSTER_NAME: PythCluster = 'pythnet';
const SOLUSD_SYMBOL = 'Crypto.SOL/USD';

// Create a dedicated queue for market data updates
const marketDataQueue = new PQueue({ 
  concurrency: 5,  // Process 5 tokens at a time
  interval: 1000,  // Time window in ms
  intervalCap: 10  // Max operations per interval
});

// Monitoring metrics
let totalUpdatesProcessed = 0;
let failedUpdates = 0;
let lastUpdateTime: Date | null = null;

export async function getSOLPrice(): Promise<number> {
  try {
    const pythConnection = new Connection(getPythClusterApiUrl(PYTHNET_CLUSTER_NAME));
    const pythPublicKey = getPythProgramKeyForCluster(PYTHNET_CLUSTER_NAME);
    const pythClient = new PythHttpClient(pythConnection, pythPublicKey);
    
    const data = await pythClient.getData();
    const solPrice = data.productPrice.get(SOLUSD_SYMBOL);
    
    if (!solPrice || !solPrice.price) {
      logger.error("Unable to get SOL/USD price");
      return 0;
    }
    
    return solPrice.price;
  } catch (error) {
    logger.error('Error fetching SOL price:', error);
    return 0;
  }
}

export async function calculateTokenMarketData(token: any, solPrice: number) {
  const TOKEN_DECIMALS = Number(process.env.DECIMALS || 6);
  const tokenPriceInSol = token.currentPrice / Math.pow(10, TOKEN_DECIMALS);
  const tokenPriceUSD = token.currentPrice > 0 ? 
      (tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)) : 0;

  const marketCapUSD = (Number(process.env.TOKEN_SUPPLY) / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;

  return {
      ...token.toObject(),
      marketCapUSD,
      tokenPriceUSD,
      solPriceUSD: solPrice,
      curveProgress: token.status === 'migrated' ? 100 : 
      ((token.reserveLamport - Number(process.env.VIRTUAL_RESERVES)) / (Number(process.env.CURVE_LIMIT) - Number(process.env.VIRTUAL_RESERVES))) * 100
  };
}

async function calculateRaydiumTokenMarketData(token: any) {
  try {
    const TOKEN_DECIMALS = Number(process.env.DECIMALS || 6);
    const SOL_DECIMALS = 9;
    const solPrice = await getSOLPrice();
    const raydium = await initSdk({ loadToken: true });

    let poolInfo;
    let retries = 5;
    
    while (retries > 0) {
      try {
        if (raydium.cluster === 'devnet') {
          const data = await raydium.cpmm.getPoolInfoFromRpc(token.marketId);
          poolInfo = data.poolInfo;
        } else {
          const data = await raydium.api.fetchPoolById({ ids: token.marketId });
          if (!data || data.length === 0) {
            logger.error('Mcap: Pool info not found');
            throw new Error('Mcap: Pool info not found');
          }
          poolInfo = data[0];
        }
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          logger.error(`Mcap: Failed to fetch pool info after retries: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, (5 - retries) * 5000));
      }
    }

    if (!poolInfo || !poolInfo.mintAmountA || !poolInfo.mintAmountB) {
      logger.error('Mcap: Invalid pool info structure');
    }

    // const virtualLiquidity = Number(process.env.VIRTUAL_RESERVES) / Math.pow(10, 9);

    // Calculate raw price (SOL/token)
    const currentPrice = poolInfo.mintAmountA > 0 ? 
      parseFloat(poolInfo.mintAmountA) / parseFloat(poolInfo.mintAmountB)
      : 0;

    // Calculate token price in USD
    const tokenPriceUSD = currentPrice > 0 ? currentPrice * solPrice : 0;

    // Calculate market cap
    const marketCapUSD = (Number(process.env.TOKEN_SUPPLY) / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;

    // Calculate total liquidity in USD
    const liquidity = poolInfo.mintAmountA > 0 && poolInfo.mintAmountB > 0 ? 
      // Token side: amount * price in USD (already in correct decimals)
      parseFloat(poolInfo.mintAmountB) * tokenPriceUSD + 
      // SOL side: amount * SOL price (already in correct decimals)
      parseFloat(poolInfo.mintAmountA) * solPrice
      : 0;

    // logger.log('Raydium market data:', {
    //   mint: token.mint,
    //   currentPrice,
    //   tokenPriceUSD,
    //   marketCapUSD,
    //   solPrice,
    //   mintAmountA: poolInfo.mintAmountA.toString(),
    //   mintAmountB: poolInfo.mintAmountB.toString(),
    //   liquidity
    // });

    return {
      marketCapUSD,
      tokenPriceUSD,
      solPriceUSD: solPrice,
      currentPrice,
      liquidity
    };
  } catch (error) {
    logger.error(`Error calculating Raydium token market data for ${token.mint}:`, error);
    logger.error('RPC Node issue - Consider using a paid RPC endpoint for better reliability');
    failedUpdates++;
    return {
      marketCapUSD: 0,
      tokenPriceUSD: 0,
      solPriceUSD: 0,
      currentPrice: 0,
      liquidity: 0
    };
  }
}

export async function updateMigratedTokenMarketData() {
  try {
    const startTime = Date.now();
    
    const migratedTokens = await Token.find({
      status: { $in: ['locked'] }
    });

    const tokenCount = migratedTokens.length;
    let successCount = 0;

    const updatePromises = migratedTokens.map(token => {
      return marketDataQueue.add(async () => {
        try {
          const marketData = await calculateRaydiumTokenMarketData(token);
          
          await Token.findOneAndUpdate(
            { mint: token.mint },
            {
              currentPrice: marketData.currentPrice,
              marketCapUSD: marketData.marketCapUSD,
              tokenPriceUSD: marketData.tokenPriceUSD,
              liquidity: marketData.liquidity,
              solPriceUSD: marketData.solPriceUSD,
              lastUpdated: new Date()
            }
          );
          
          successCount++;
        } catch (error) {
          logger.error(`Error updating market data for token ${token.mint}:`, error);
          failedUpdates++;
        }
      });
    });

    await Promise.all(updatePromises);
    
    const endTime = Date.now();
    totalUpdatesProcessed += tokenCount;
    lastUpdateTime = new Date();

    logger.log(`Market data update complete:
      - Tokens processed: ${tokenCount}
      - Successful updates: ${successCount}
      - Failed updates: ${failedUpdates}
      - Time taken: ${(endTime - startTime) / 1000}s
      - Total updates lifetime: ${totalUpdatesProcessed}
      - Queue size: ${marketDataQueue.size}
      - Pending: ${marketDataQueue.pending}`);

  } catch (error) {
    logger.error('Error in updateMigratedTokenMarketData:', error);
    failedUpdates++;
  }
}

// Export metrics for monitoring
export function getMarketDataMetrics() {
  return {
    totalUpdatesProcessed,
    failedUpdates,
    lastUpdateTime,
    queueSize: marketDataQueue.size,
    pendingUpdates: marketDataQueue.pending
  };
}

// Run market data updates every 5 minutes
const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
setInterval(updateMigratedTokenMarketData, UPDATE_INTERVAL);

// Run market data update on startup
updateMigratedTokenMarketData();

// Run missed events processing 
processMissedEvents();
