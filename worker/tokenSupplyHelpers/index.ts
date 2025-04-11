import { Connection, PublicKey } from "@solana/web3.js";
import { getDB, tokens } from "../db";
import { eq } from "drizzle-orm";
import { Env } from "../env";
import { logger } from "../logger";
import {retryOperation} from "../raydium/utils";

export function shouldUpdateSupply(token: any): boolean {
  if (!token.lastSupplyUpdate) {
    return true;
  }
  const lastUpdate = new Date(token.lastSupplyUpdate).getTime();
  const oneHourAgo = Date.now() - 3600 * 1000;
  return lastUpdate < oneHourAgo;
}

export async function updateTokenSupplyFromChain(
  env: Env,
  tokenMint: string,
): Promise<{
  tokenSupply: string;
  tokenSupplyUiAmount: number;
  tokenDecimals: number;
  lastSupplyUpdate: string;
}> {
   const connection = new Connection(env.RPC_URL, "confirmed");
   // retry in case it fails once
  const supplyResponse = await retryOperation(
   () => connection.getTokenSupply(new PublicKey(tokenMint)),
   2,
   5000
 );
  if (!supplyResponse || !supplyResponse.value) {
    throw new Error(`Failed to fetch token supply for ${tokenMint}`);
  }
  const { amount, uiAmount, decimals } = supplyResponse.value;
  const now = new Date().toISOString();

  const db = getDB(env);
  await db
    .update(tokens)
    .set({
      tokenSupply: amount,
      tokenSupplyUiAmount: uiAmount,
      tokenDecimals: decimals,
      lastSupplyUpdate: now,
    })
    .where(eq(tokens.mint, tokenMint))
    .execute();

  logger.log(`Token supply updated for ${tokenMint}`);
  return {
    tokenSupply: amount,
    tokenSupplyUiAmount: uiAmount || 0,
    tokenDecimals: decimals,
    lastSupplyUpdate: now,
  };
}
