import { PublicKey } from '@solana/web3.js';
import { publicKey, Umi } from '@metaplex-foundation/umi';
import { fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata';

import { logger } from '../logger';
import { SEED_BONDING_CURVE } from './constant';
import { Token, type TokenMetadataJson, type TokenType } from '../schemas';
import { metadataCache } from '../cache';
import { config } from './solana';
import { getIoServer } from './util';

/**
 * Fetches metadata with exponential backoff retry
 */
export const fetchMetadataWithBackoff = async (umi: Umi, tokenAddress: string) => {
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

export async function getTxIdAndCreatorFromTokenAddress(
  tokenAddress: string, 
) {
  console.log(`tokenAddress: ${tokenAddress}`);

  const transactionHistory = await config.connection.getSignaturesForAddress(
    new PublicKey(tokenAddress)
  );

  if (transactionHistory.length > 0) {
    const tokenCreationTxId = transactionHistory[transactionHistory.length - 1].signature;
    const transactionDetails = await config.connection.getTransaction(tokenCreationTxId);

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
): Promise<TokenType> {
  try {
    let metadata = await fetchMetadataWithBackoff(config.umi, tokenAddress);
    logger.log(`Fetched metadata for token ${tokenAddress}:`);

    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from(SEED_BONDING_CURVE), new PublicKey(tokenAddress).toBytes()],
      config.program.programId
    );

    const bondingCurveAccount = await config.program.account.bondingCurve.fetchNullable(
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

    const {getSOLPrice} = await import('../mcap');
    const solPrice = await getSOLPrice();

    const currentPrice = Number(bondingCurveAccount.reserveToken) > 0 ? 
      (Number(bondingCurveAccount.reserveLamport) / 1e9) / 
      (Number(bondingCurveAccount.reserveToken) / Math.pow(10, TOKEN_DECIMALS))
      : 0;

    const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
    const tokenPriceUSD = currentPrice > 0 ? 
        (tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)) : 0;

    const marketCapUSD = (Number(process.env.TOKEN_SUPPLY) / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;

    const tokenData = {
      name: metadata.metadata.name,
      ticker: metadata.metadata.symbol,
      url: metadata.metadata.uri,
      image: additionalMetadata?.image || '',
      twitter: additionalMetadata?.twitter || '',
      telegram: additionalMetadata?.telegram || '',
      website: additionalMetadata?.website || '',
      discord: additionalMetadata?.discord || '',
      description: additionalMetadata?.description || '',
      agentLink: additionalMetadata?.agentLink || '',
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
      status: 'active' as const,
      createdAt: new Date(),
      lastUpdated: new Date(),
      priceChange24h: 0,
      price24hAgo: tokenPriceUSD,
      volume24h: 0,
      inferenceCount: 0,
      txId
    };

    getIoServer().to('global').emit('newToken', tokenData);

    return tokenData;
  } catch (error) {
    logger.error('Error processing new token log:', error);
    throw new Error('Error processing new token log: ' + error);
  }
}

export const bulkUpdatePartialTokens = async (tokens: Partial<TokenType>[]) => {
  const filledTokenPromises = tokens.map(async token => {
    if (token.name) return token;

    const {creatorAddress, tokenCreationTxId} = await getTxIdAndCreatorFromTokenAddress(token.mint)
    const baseToken = await createNewTokenData(tokenCreationTxId, token.mint, creatorAddress);
    return {...baseToken, ...token}
  })

  const filledTokens = await Promise.all(filledTokenPromises);

  await Token.bulkWrite(filledTokens.map(token => ({
    updateOne: {
      filter: { mint: token.mint },
      update: {$set: token},
      upsert: true,
    }
  })));

  return filledTokens;
}