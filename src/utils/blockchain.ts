import { Connection, PublicKey, ParsedAccountData } from "@solana/web3.js";
import { env } from "./env";

// Use Helius RPC URL from environment variables
export const getRpcUrl = (): string => {
  // Use the MAINNET_RPC_URL from environment or fallback to hardcoded value
  // (Only for development - should use env in production)
  return (
    env.mainnetRpcUrl ||
    "https://mainnet.helius-rpc.com/?api-key=28741947-d621-41a0-95db-bbd1b57ccf8a"
  );
};

// Cache to store previously fetched data
const cache = {
  signatures: new Map<string, any[]>(),
  transactions: new Map<string, any>(),
  tokenAccounts: new Map<string, any[]>(),
  tokenSupply: new Map<string, any>(),
};

// Request queue to manage RPC calls
class RequestQueue {
  private queue: {
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }[] = [];
  private processing = false;
  private rateWindow = 1000; // 1 second window
  private maxRequestsPerWindow = 5; // Max requests per window
  private requestsInWindow = 0;
  private windowStartTime = Date.now();

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (!this.processing) this.processQueue();
    });
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;

    // Check if we need to wait for rate limit
    const now = Date.now();
    if (now - this.windowStartTime > this.rateWindow) {
      // Reset window if it's expired
      this.windowStartTime = now;
      this.requestsInWindow = 0;
    }

    if (this.requestsInWindow >= this.maxRequestsPerWindow) {
      // Wait until the current window expires
      const waitTime = this.rateWindow - (now - this.windowStartTime);
      console.log(`Rate limiting: waiting ${waitTime}ms before next request`);
      await delay(waitTime + 100); // Add a small buffer
      this.windowStartTime = Date.now();
      this.requestsInWindow = 0;
    }

    // Process next item in queue
    const { fn, resolve, reject } = this.queue.shift()!;
    this.requestsInWindow++;

    try {
      const result = await fn();
      resolve(result);
    } catch (error: any) {
      if (error.message?.includes("429") || error.toString().includes("429")) {
        console.log(
          "Rate limit hit (429). Adding request back to queue with backoff.",
        );
        // Put the request back at the end of the queue
        this.queue.push({ fn, resolve, reject });
        // Wait with exponential backoff
        await delay(Math.pow(2, Math.min(3, this.requestsInWindow)) * 1000);
      } else {
        reject(error);
      }
    }

    // Continue processing queue
    setTimeout(() => this.processQueue(), 100);
  }
}

// Create global request queue instance
const requestQueue = new RequestQueue();

// Simple delay function for rate limiting
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Create connection instance with proper config
export const getConnection = (): Connection => {
  return new Connection(getRpcUrl(), "confirmed");
};

// Wrapper for connection methods with queuing, retries and caching
const queuedRequest = async <T>(
  cacheKey: string | null,
  cacheMap: Map<string, T> | null,
  fn: () => Promise<T>,
  ttlMs: number = 30000, // 30 seconds cache TTL by default
): Promise<T> => {
  // Check cache first if caching is enabled for this request
  if (cacheKey && cacheMap && cacheMap.has(cacheKey)) {
    return cacheMap.get(cacheKey) as T;
  }

  try {
    // Queue the request
    const result = await requestQueue.add(fn);

    // Store in cache if caching is enabled
    if (cacheKey && cacheMap) {
      cacheMap.set(cacheKey, result);
      // Expire cache entry after TTL
      setTimeout(() => cacheMap.delete(cacheKey), ttlMs);
    }

    return result;
  } catch (error) {
    console.error(`Error in queuedRequest:`, error);
    throw error;
  }
};

export interface TokenHolder {
  address: string;
  amount: number;
  percentage: string;
}

export interface TokenTransaction {
  txId: string;
  timestamp: string;
  user: string;
  direction: number; // 0 = buy, 1 = sell
  amountIn: number;
  amountOut: number;
  directionText: string;
}

export interface TokenPriceCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TokenMarketMetrics {
  marketCapUSD: number;
  volume24h: number;
  currentPrice: number;
  tokenPriceUSD: number;
  solPriceUSD: number;
  priceChange24h: number;
  price24hAgo: number;
  totalSupply: number;
  holderCount: number;
}

// Enhanced version of fetchTokenMarketMetrics with proper rate limiting
export const fetchTokenMarketMetrics = async (
  tokenMint: string,
): Promise<TokenMarketMetrics> => {
  try {
    console.log(
      `Fetching token market metrics from blockchain for ${tokenMint}`,
    );
    const connection = getConnection();

    // Get token supply with caching
    const tokenSupplyInfo = await queuedRequest(
      `tokenSupply:${tokenMint}`,
      cache.tokenSupply,
      () => connection.getTokenSupply(new PublicKey(tokenMint)),
      120000, // 2 minute cache for token supply
    );

    // const decimals = tokenSupplyInfo.value.decimals;
    const totalSupply = tokenSupplyInfo.value.uiAmount || 0;

    // Get holder count from fetchTokenHolders (which has its own caching)
    const holdersData = await fetchTokenHolders(tokenMint);
    const holderCount = holdersData.total;

    // Get SOL price in USD from CoinGecko
    let solPriceUSD = 150; // Default fallback
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
        { headers: { Accept: "application/json" } },
      );
      if (response.ok) {
        const data = (await response.json()) as { solana?: { usd?: number } };
        if (data.solana && data.solana.usd) {
          solPriceUSD = data.solana.usd;
          console.log(`Fetched SOL price from CoinGecko: $${solPriceUSD}`);
        }
      }
    } catch (error) {
      console.error("Error fetching SOL price from CoinGecko:", error);
      // Continue with default price
    }

    // Get more signatures to have better chance of finding valid swap transactions
    const signatures = await queuedRequest(
      `signatures:${tokenMint}`,
      cache.signatures,
      () =>
        connection.getSignaturesForAddress(new PublicKey(tokenMint), {
          limit: 25,
        }),
      60000, // 1 minute cache for signatures
    );

    console.log(
      `Found ${signatures.length} signatures to analyze for price discovery`,
    );

    // Initialize price data
    let currentPrice = 0;
    let tokenPriceUSD = 0;
    let volume24h = 0;
    let priceChange24h = 0;
    let price24hAgo = 0;
    let marketCapUSD = 0;

    if (signatures.length > 0) {
      // Get more transaction data to ensure we find valid swap transactions
      const txPromises = signatures.slice(0, 10).map(async (sig) => {
        try {
          const tx = await queuedRequest(
            `tx:${sig.signature}`,
            cache.transactions,
            () =>
              connection.getParsedTransaction(sig.signature, {
                maxSupportedTransactionVersion: 0,
              }),
            300000, // 5 minute cache for transactions
          );

          if (!tx || !tx.meta || tx.meta.err) return null;

          // Look specifically for token transfers that represent swaps
          const preTokenBalance = tx.meta.preTokenBalances?.find(
            (balance: { mint: string }) => balance.mint === tokenMint,
          );

          const postTokenBalance = tx.meta.postTokenBalances?.find(
            (balance: { mint: string }) => balance.mint === tokenMint,
          );

          if (!preTokenBalance || !postTokenBalance) return null;

          // Get token amounts before and after
          const preAmount = preTokenBalance.uiTokenAmount.uiAmount || 0;
          const postAmount = postTokenBalance.uiTokenAmount.uiAmount || 0;

          // Calculate amount transferred
          const tokenAmount = Math.abs(postAmount - preAmount);

          if (tokenAmount <= 0) return null;

          // Determine if it's buy or sell (important for accurate price)
          const isBuy = postAmount > preAmount;

          // Calculate total SOL transferred (including fees)
          let solAmount = 0;
          let solFees = 0;

          if (tx.meta.preBalances && tx.meta.postBalances) {
            // First find fee payer to exclude fee amount from swap calculations
            const feePayerIndex = 0; // Usually the first account pays fees

            if (
              tx.meta.preBalances.length > feePayerIndex &&
              tx.meta.postBalances.length > feePayerIndex
            ) {
              const preFeePayer = tx.meta.preBalances[feePayerIndex];
              const postFeePayer = tx.meta.postBalances[feePayerIndex];
              solFees = Math.max(0, (preFeePayer - postFeePayer) / 1e9);
            }

            // Loop through all accounts to find SOL transfers
            for (let i = 0; i < tx.meta.preBalances.length; i++) {
              const preBalance = tx.meta.preBalances[i];
              const postBalance = tx.meta.postBalances[i];

              // For buys: SOL decreases (preBalance > postBalance)
              // For sells: SOL increases (postBalance > preBalance)
              const balanceChange = (preBalance - postBalance) / 1e9;

              // Only include significant changes, ignore small adjustments
              if (Math.abs(balanceChange) > 0.001) {
                if (
                  (isBuy && balanceChange > 0) ||
                  (!isBuy && balanceChange < 0)
                ) {
                  solAmount = Math.abs(balanceChange);
                  break; // We found the main SOL transfer
                }
              }
            }
          }

          // For a valid swap, both SOL and token amounts should be positive
          // And we subtract fees from SOL amount
          if (solAmount > solFees && tokenAmount > 0) {
            const actualSolAmount = solAmount - solFees;

            // Calculate price (SOL per token)
            const price = actualSolAmount / tokenAmount;

            console.log(
              `Found swap: ${isBuy ? "BUY" : "SELL"}, Token Amount: ${tokenAmount}, SOL Amount: ${actualSolAmount}, Price: ${price}`,
            );

            return {
              price,
              solAmount: actualSolAmount,
              tokenAmount,
              timestamp: sig.blockTime || 0,
              isBuy,
            };
          }

          return null;
        } catch (error) {
          console.error(
            `Error processing transaction ${sig.signature}:`,
            error,
          );
          return null;
        }
      });

      const txResults = await Promise.all(txPromises);
      const validTxs = txResults.filter((tx) => tx !== null) as Array<{
        price: number;
        solAmount: number;
        tokenAmount: number;
        timestamp: number;
        isBuy: boolean;
      }>;

      // Sort by timestamp (most recent first)
      validTxs.sort((a, b) => b.timestamp - a.timestamp);

      console.log(
        `Found ${validTxs.length} valid swap transactions for price calculation`,
      );

      // Get the most recent valid price, prioritizing buys for current price
      if (validTxs.length > 0) {
        // Prioritize recent buy transactions for price
        const recentBuys = validTxs.filter((tx) => tx.isBuy);
        if (recentBuys.length > 0) {
          currentPrice = recentBuys[0].price;
        } else {
          // If no recent buys, use the most recent transaction regardless of type
          currentPrice = validTxs[0].price;
        }

        tokenPriceUSD = currentPrice * solPriceUSD;

        // Calculate market cap properly using total supply
        marketCapUSD = totalSupply * tokenPriceUSD;

        console.log(`Calculated price: ${currentPrice} SOL per token`);
        console.log(`Token USD price: $${tokenPriceUSD}`);
        console.log(
          `Market cap: $${marketCapUSD} (Total Supply: ${totalSupply})`,
        );

        // Calculate 24h volume more accurately
        const now = Math.floor(Date.now() / 1000);
        const oneDayAgo = now - 86400;

        // Sum up volumes for transactions in last 24h
        const txs24h = validTxs.filter((tx) => tx.timestamp >= oneDayAgo);
        volume24h = txs24h.reduce(
          (sum, tx) => sum + tx.tokenAmount * tx.price * solPriceUSD,
          0,
        );

        // Find oldest transaction in the last 24h for price change
        if (txs24h.length > 0) {
          const oldest = txs24h[txs24h.length - 1];
          price24hAgo = oldest.price;
          if (price24hAgo > 0) {
            priceChange24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;
          }
        }
      }
    }

    // Construct and return the metrics
    const metrics: TokenMarketMetrics = {
      marketCapUSD,
      volume24h,
      currentPrice,
      tokenPriceUSD,
      solPriceUSD,
      priceChange24h,
      price24hAgo,
      totalSupply,
      holderCount,
    };

    console.log(`Calculated real metrics for ${tokenMint}:`, metrics);

    return metrics;
  } catch (error) {
    console.error(
      `Error fetching token market metrics from blockchain:`,
      error,
    );

    // Return default values on error - these won't be used if the API has data
    return {
      marketCapUSD: 0,
      volume24h: 0,
      currentPrice: 0,
      tokenPriceUSD: 0,
      solPriceUSD: 150, // Fallback value
      priceChange24h: 0,
      price24hAgo: 0,
      totalSupply: 0,
      holderCount: 0,
    };
  }
};

// Enhanced version of fetchTokenHolders with proper rate limiting
export const fetchTokenHolders = async (
  tokenMint: string,
): Promise<{ holders: TokenHolder[]; total: number }> => {
  try {
    console.log(
      `Fetching token holders directly from blockchain for ${tokenMint}`,
    );

    // Use cached holders data if available (2 minute cache)
    const cacheKey = `holders:${tokenMint}`;
    if (cache.tokenAccounts.has(cacheKey)) {
      const cachedData = cache.tokenAccounts.get(cacheKey)!;
      return {
        holders: cachedData,
        total: cachedData.length,
      };
    }

    const connection = getConnection();

    // Get all token accounts for this mint
    const accounts = await queuedRequest(
      null, // Don't cache this specific request
      null,
      () =>
        connection.getParsedProgramAccounts(
          new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
          {
            filters: [
              {
                dataSize: 165,
              },
              {
                memcmp: {
                  offset: 0,
                  bytes: tokenMint,
                },
              },
            ],
          },
        ),
    );

    console.log(
      `Found ${accounts.length} token accounts for mint ${tokenMint}`,
    );

    // Process accounts to extract holder information
    let totalTokens = 0;
    const holders = accounts
      .map((account) => {
        const parsedAccountInfo = account.account.data as ParsedAccountData;
        const tokenBalance =
          parsedAccountInfo.parsed?.info?.tokenAmount?.uiAmount || 0;
        const ownerAddress = parsedAccountInfo.parsed?.info?.owner || "";

        return {
          address: ownerAddress,
          amount: tokenBalance,
          raw: tokenBalance,
        };
      })
      .filter((holder) => holder.amount > 0);

    // Calculate total tokens for percentage
    totalTokens = holders.reduce((sum, holder) => sum + holder.raw, 0);

    // Calculate percentages
    const holdersWithPercentage = holders.map((holder) => ({
      address: holder.address,
      amount: holder.amount,
      percentage:
        totalTokens > 0
          ? ((holder.raw / totalTokens) * 100).toFixed(2)
          : "0.00",
    }));

    // Sort by amount (descending)
    holdersWithPercentage.sort((a, b) => b.amount - a.amount);

    // Cache the result for 2 minutes
    cache.tokenAccounts.set(cacheKey, holdersWithPercentage);
    setTimeout(() => cache.tokenAccounts.delete(cacheKey), 120000);

    return {
      holders: holdersWithPercentage,
      total: holdersWithPercentage.length,
    };
  } catch (error) {
    console.error(`Error fetching token holders from blockchain:`, error);
    return { holders: [], total: 0 };
  }
};

// Enhanced version of fetchTokenTransactions with proper rate limiting
export const fetchTokenTransactions = async (
  tokenMint: string,
  limit = 10,
): Promise<{ swaps: TokenTransaction[]; total: number }> => {
  try {
    // Use cached transactions if available
    const cacheKey = `txs:${tokenMint}:${limit}`;
    const cachedData = cache.transactions.get(cacheKey);
    if (cachedData) {
      console.log(`Using cached transaction data for ${tokenMint}`);
      return cachedData;
    }

    console.log(
      `Fetching token transactions directly from blockchain for ${tokenMint}`,
    );
    const connection = getConnection();

    // Get recent signatures with smaller batch
    const signatures = await queuedRequest(
      `signatures:${tokenMint}`,
      cache.signatures,
      () =>
        connection.getSignaturesForAddress(
          new PublicKey(tokenMint),
          { limit: Math.min(limit * 2, 25) }, // Request fewer signatures to avoid rate limits
        ),
      60000, // 1 minute cache for signatures
    );

    console.log(
      `Found ${signatures.length} recent signatures for mint ${tokenMint}`,
    );

    if (signatures.length === 0) {
      return { swaps: [], total: 0 };
    }

    // Get transaction details for a limited batch of signatures
    const signaturesToProcess = signatures.slice(
      0,
      Math.min(signatures.length, 5),
    );

    const transactionPromises = signaturesToProcess.map(async (sig) => {
      try {
        // Use cached transaction data if available
        const tx = await queuedRequest(
          `tx:${sig.signature}`,
          cache.transactions,
          () =>
            connection.getParsedTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            }),
          300000, // 5 minute cache for transactions
        );

        if (!tx || !tx.meta || tx.meta.err) {
          return null;
        }

        const timestamp = sig.blockTime
          ? new Date(sig.blockTime * 1000).toISOString()
          : new Date().toISOString();

        const preTokenBalance = tx.meta.preTokenBalances?.find(
          (balance: { mint: string }) => balance.mint === tokenMint,
        );
        const postTokenBalance = tx.meta.postTokenBalances?.find(
          (balance: { mint: string }) => balance.mint === tokenMint,
        );

        if (!preTokenBalance || !postTokenBalance) {
          return null;
        }

        const preAmount = preTokenBalance.uiTokenAmount.uiAmount || 0;
        const postAmount = postTokenBalance.uiTokenAmount.uiAmount || 0;
        const tokenAmount = Math.abs(postAmount - preAmount);

        if (tokenAmount <= 0) {
          return null;
        }

        const isBuy = postAmount > preAmount;
        const direction = isBuy ? 0 : 1; // 0 = buy, 1 = sell

        let solAmount = 0;
        if (tx.meta.preBalances && tx.meta.postBalances) {
          for (let i = 0; i < tx.meta.preBalances.length; i++) {
            const preBalance = tx.meta.preBalances[i];
            const postBalance = tx.meta.postBalances[i];
            const delta = Math.abs(postBalance - preBalance) / 1e9;

            if (delta > 0.001) {
              solAmount += delta;
            }
          }
        }

        let user = "";
        const ownerAddress = preTokenBalance.owner || postTokenBalance.owner;
        if (ownerAddress) {
          user = ownerAddress;
        } else if (tx.transaction?.message?.accountKeys?.length > 0) {
          user = tx.transaction.message.accountKeys[0].pubkey.toString();
        }

        return {
          txId: sig.signature,
          timestamp,
          user,
          direction,
          amountIn: direction === 0 ? solAmount : tokenAmount,
          amountOut: direction === 0 ? tokenAmount : solAmount,
          directionText: direction === 0 ? "Buy" : "Sell",
        };
      } catch (err) {
        console.error(`Error fetching transaction ${sig.signature}:`, err);
        return null;
      }
    });

    const transactions = await Promise.all(transactionPromises);
    const validTransactions = transactions.filter(
      (tx) => tx !== null,
    ) as TokenTransaction[];

    const sortedTransactions = validTransactions
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, limit);

    const result = {
      swaps: sortedTransactions,
      total: sortedTransactions.length,
    };

    // Cache the result for 1 minute
    cache.transactions.set(cacheKey, result);
    setTimeout(() => cache.transactions.delete(cacheKey), 60000);

    return result;
  } catch (error) {
    console.error(`Error fetching token transactions from blockchain:`, error);
    return { swaps: [], total: 0 };
  }
};

// Enhanced version of fetchTokenChartData with proper rate limiting
export const fetchTokenChartData = async (
  tokenMint: string,
  from: number,
  to: number,
  resolution: number,
): Promise<{ table: TokenPriceCandle[]; nextTime: number | null }> => {
  try {
    // Use cached chart data if available
    const cacheKey = `chart:${tokenMint}:${from}:${to}:${resolution}`;
    const cachedData = cache.transactions.get(cacheKey);
    if (cachedData) {
      console.log(`Using cached chart data for ${tokenMint}`);
      return cachedData;
    }

    console.log(
      `Fetching token chart data from blockchain for ${tokenMint} (resolution: ${resolution})`,
    );
    const connection = getConnection();

    // Get more signatures for better data
    const signatures = await queuedRequest(
      `signatures:${tokenMint}`,
      cache.signatures,
      () =>
        connection.getSignaturesForAddress(
          new PublicKey(tokenMint),
          { limit: 100 }, // Increased for better chart resolution
        ),
      60000, // 1 minute cache for signatures
    );

    console.log(`Found ${signatures.length} signatures for chart data`);

    if (signatures.length === 0) {
      return { table: [], nextTime: null };
    }

    // Filter signatures within the time range
    const filteredSignatures = signatures.filter((sig) => {
      if (!sig.blockTime) return false;
      const time = sig.blockTime;
      return time >= from && time <= to;
    });

    console.log(
      `Filtered to ${filteredSignatures.length} signatures in the time range`,
    );

    // Process a reasonable batch of signatures to get good chart data
    const signaturesToProcess = filteredSignatures.slice(
      0,
      Math.min(filteredSignatures.length, 25),
    );

    const transactionPromises = signaturesToProcess.map(async (sig) => {
      try {
        // Use cached transaction data if available
        const tx = await queuedRequest(
          `tx:${sig.signature}`,
          cache.transactions,
          () =>
            connection.getParsedTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            }),
          300000, // 5 minute cache for transactions
        );

        if (!tx || !tx.meta || tx.meta.err || !sig.blockTime) {
          return null;
        }

        // Look specifically for token transfers that represent swaps
        const preTokenBalance = tx.meta.preTokenBalances?.find(
          (balance: { mint: string }) => balance.mint === tokenMint,
        );
        const postTokenBalance = tx.meta.postTokenBalances?.find(
          (balance: { mint: string }) => balance.mint === tokenMint,
        );

        if (!preTokenBalance || !postTokenBalance) {
          return null;
        }

        // Get token amounts before and after
        const preAmount = preTokenBalance.uiTokenAmount.uiAmount || 0;
        const postAmount = postTokenBalance.uiTokenAmount.uiAmount || 0;

        // Calculate amount transferred
        const tokenAmount = Math.abs(postAmount - preAmount);

        if (tokenAmount <= 0) {
          return null;
        }

        // Determine if it's buy or sell (important for accurate price)
        const isBuy = postAmount > preAmount;

        // Calculate total SOL transferred (including fees)
        let solAmount = 0;
        let solFees = 0;

        if (tx.meta.preBalances && tx.meta.postBalances) {
          // First find fee payer to exclude fee amount from swap calculations
          const feePayerIndex = 0; // Usually the first account pays fees

          if (
            tx.meta.preBalances.length > feePayerIndex &&
            tx.meta.postBalances.length > feePayerIndex
          ) {
            const preFeePayer = tx.meta.preBalances[feePayerIndex];
            const postFeePayer = tx.meta.postBalances[feePayerIndex];
            solFees = Math.max(0, (preFeePayer - postFeePayer) / 1e9);
          }

          // Loop through all accounts to find SOL transfers
          for (let i = 0; i < tx.meta.preBalances.length; i++) {
            const preBalance = tx.meta.preBalances[i];
            const postBalance = tx.meta.postBalances[i];

            // For buys: SOL decreases (preBalance > postBalance)
            // For sells: SOL increases (postBalance > preBalance)
            const balanceChange = (preBalance - postBalance) / 1e9;

            // Only include significant changes, ignore small adjustments
            if (Math.abs(balanceChange) > 0.001) {
              if (
                (isBuy && balanceChange > 0) ||
                (!isBuy && balanceChange < 0)
              ) {
                solAmount = Math.abs(balanceChange);
                break; // We found the main SOL transfer
              }
            }
          }
        }

        // For a valid swap, both SOL and token amounts should be positive
        // And we subtract fees from SOL amount
        if (solAmount > solFees && tokenAmount > 0) {
          const actualSolAmount = solAmount - solFees;

          // Calculate price (SOL per token)
          const price = actualSolAmount / tokenAmount;

          return {
            time: sig.blockTime,
            price,
            solAmount: actualSolAmount,
            tokenAmount,
            isBuy,
          };
        }

        return null;
      } catch (err) {
        console.error(`Error processing transaction ${sig.signature}:`, err);
        return null;
      }
    });

    const pricePoints = (await Promise.all(transactionPromises)).filter(
      (point) => point !== null,
    ) as {
      time: number;
      price: number;
      solAmount: number;
      tokenAmount: number;
      isBuy: boolean;
    }[];

    if (pricePoints.length === 0) {
      console.log("No valid price points found in transactions");
      return { table: [], nextTime: null };
    }

    console.log(
      `Found ${pricePoints.length} valid price points for chart data`,
    );

    // Sort price points by time
    pricePoints.sort((a, b) => a.time - b.time);

    // Convert to candles based on resolution
    const candles = generateCandles(pricePoints, resolution, from, to);

    const result = {
      table: candles,
      nextTime: candles.length > 0 ? candles[0].time : null,
    };

    // Cache the result for 5 minutes
    cache.transactions.set(cacheKey, result);
    setTimeout(() => cache.transactions.delete(cacheKey), 300000);

    return result;
  } catch (error) {
    console.error(`Error fetching token chart data from blockchain:`, error);
    return { table: [], nextTime: null };
  }
};

// Helper function to generate candles from price points
function generateCandles(
  pricePoints: {
    time: number;
    price: number;
    solAmount?: number;
    tokenAmount?: number;
  }[],
  resolution: number,
  _from: number,
  to: number,
): TokenPriceCandle[] {
  if (pricePoints.length === 0) return [];

  const resolutionInSeconds = resolution * 60;
  const candles: TokenPriceCandle[] = [];
  let currentTime =
    Math.floor(pricePoints[0].time / resolutionInSeconds) * resolutionInSeconds;

  while (currentTime <= to) {
    const periodPoints = pricePoints.filter(
      (p) =>
        p.time >= currentTime && p.time < currentTime + resolutionInSeconds,
    );

    if (periodPoints.length > 0) {
      const prices = periodPoints.map((p) => p.price);

      candles.push({
        time: currentTime,
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: prices[prices.length - 1],
        volume: periodPoints.length,
      });
    } else if (candles.length > 0) {
      const lastClose = candles[candles.length - 1].close;

      candles.push({
        time: currentTime,
        open: lastClose,
        high: lastClose,
        low: lastClose,
        close: lastClose,
        volume: 0,
      });
    }

    currentTime += resolutionInSeconds;
  }

  return candles;
}
