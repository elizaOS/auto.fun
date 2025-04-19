import { logger } from "./logger";
import { Env } from "./env";
import { initSolanaConfig, getProgram } from "./solana";
import { Autofun } from "./target/types/autofun";
import { Wallet } from "./tokenSupplyHelpers/customWallet";
import { PublicKey } from "@solana/web3.js";
import { getDB, Token, tokenHolders, tokens } from "./db";
import { CacheService } from "./cache";
import { fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { getSOLPrice } from "./mcap";

import { Umi, publicKey } from "@metaplex-foundation/umi";

export const SEED_CONFIG = "config";
export const SEED_BONDING_CURVE = "bonding_curve";

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
         lastSupplyUpdate: new Date().toISOString(),
         createdAt: new Date().toISOString(),
         lastUpdated: new Date().toISOString(),
      };


      return tokenData;
   } catch (error) {
      logger.error("Error processing new token log:", error);
      throw new Error("Error processing new token log: " + error);
   }
}


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