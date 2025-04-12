import { Connection, PublicKey } from "@solana/web3.js";
import { getDB, tokens } from "../db";
import { eq } from "drizzle-orm";
import { Env } from "../env";
import { logger } from "../logger";
import { retryOperation } from "../raydium/utils";
import { processTransactionLogs } from "../cron";
import { getWebSocketClient } from "../websocket-client";

export async function handleSignature(env: Env, signature: string) {
  const connection = new Connection(
    env.NETWORK === "devnet"
      ? env.DEVNET_SOLANA_RPC_URL
      : env.MAINNET_SOLANA_RPC_URL,
  );

  // finalize
  const commitment = "confirmed";

  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment,
  });

  const logs = tx?.meta?.logMessages;

  const wsClient = getWebSocketClient(env);
  await processTransactionLogs(env, logs || [], signature, wsClient);

  return logs;
}

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
  const connection = new Connection(
    env.NETWORK === "mainnet"
      ? env.MAINNET_SOLANA_RPC_URL
      : env.DEVNET_SOLANA_RPC_URL,
    "confirmed",
  );
  // retry in case it fails once
  const supplyResponse = await retryOperation(
    () => connection.getTokenSupply(new PublicKey(tokenMint)),
    2,
    5000,
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
