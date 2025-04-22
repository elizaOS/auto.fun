import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";
import { updateTokenInDB } from "../../cron";
import { getDB, tokens } from "../../db";
import { Env } from "../../env";
import * as IDL from "@autodotfun/program/idl/autofun.json";
import { Autofun } from "@autodotfun/program/types/autofun";
import { updateTokenSupplyFromChain } from "../../tokenSupplyHelpers";
import { Wallet } from "../../tokenSupplyHelpers/customWallet";
import { logger } from "../../util";
import { getWebSocketClient } from "../../websocket-client";
import { TokenMigrator } from "../migration/migrateToken";
import * as raydium_vault_IDL from "@autodotfun/program/idl/raydium_vault.json";
import { RaydiumVault } from "../types/raydium_vault";
import { TokenData } from "../types/tokenData";
import { retryOperation } from "../utils";

export interface LockResult {
  txId: string;
}

export interface MigrationStepResult {
  txId: string;
  extraData?: Record<string, any>;
}

export type MigrationStepFn = (
  token: TokenData,
) => Promise<MigrationStepResult>;

export interface MigrationStep {
  name: string;
  description?: string;
  fn: MigrationStepFn;
  eventName?: string;
}

export async function getToken(
  env: Env,
  mint: string,
): Promise<TokenData | null> {
  const db = getDB();
  const tokenRecords = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, mint))
    .limit(1)
    .execute();

  if (tokenRecords.length > 0) {
    const tokenDb = tokenRecords[0];
    let tokenSupply = tokenDb.tokenSupply;
    let tokenSupplyUiAmount = tokenDb.tokenSupplyUiAmount;
    let tokenDecimals = tokenDb.tokenDecimals;
    let lastSupplyUpdate = tokenDb.lastSupplyUpdate;

    if (tokenDb.tokenDecimals === undefined) {
      const supplyResult = await updateTokenSupplyFromChain(env, tokenDb.mint);
      tokenSupply = supplyResult.tokenSupply;
      tokenSupplyUiAmount = supplyResult.tokenSupplyUiAmount;
      tokenDecimals = supplyResult.tokenDecimals;
      lastSupplyUpdate = new Date(supplyResult.lastSupplyUpdate);
    }

    const token: TokenData = {
      id: tokenDb.id,
      name: tokenDb.name,
      ticker: tokenDb.ticker,
      url: tokenDb.url,
      image: tokenDb.image,
      twitter: tokenDb.twitter ?? undefined,
      telegram: tokenDb.telegram ?? undefined,
      farcaster: tokenDb.farcaster ?? undefined,
      website: tokenDb.website ?? undefined,
      discord: tokenDb.discord ?? undefined,
      description: tokenDb.description ?? undefined,
      mint: tokenDb.mint,
      creator: tokenDb.creator,
      nftMinted: tokenDb.nftMinted ?? undefined,
      lockId: tokenDb.lockId ?? undefined,
      lockedAmount: tokenDb.lockedAmount ?? undefined,
      lockedAt: tokenDb.lockedAt ?? undefined,
      harvestedAt: tokenDb.harvestedAt ?? undefined,
      status: tokenDb.status,
      createdAt: tokenDb.createdAt,
      lastUpdated: tokenDb.lastUpdated.toISOString(),
      completedAt: tokenDb.completedAt ?? undefined,
      withdrawnAt: tokenDb.withdrawnAt ?? undefined,
      migratedAt: tokenDb.migratedAt ?? undefined,
      marketId: tokenDb.marketId ?? undefined,
      baseVault: tokenDb.baseVault ?? undefined,
      quoteVault: tokenDb.quoteVault ?? undefined,
      reserveAmount: tokenDb.reserveAmount ?? undefined,
      reserveLamport: tokenDb.reserveLamport ?? undefined,
      virtualReserves: tokenDb.virtualReserves ?? undefined,
      liquidity: tokenDb.liquidity ?? undefined,
      currentPrice: tokenDb.currentPrice ?? undefined,
      marketCapUSD: tokenDb.marketCapUSD ?? undefined,
      tokenPriceUSD: tokenDb.tokenPriceUSD ?? undefined,
      solPriceUSD: tokenDb.solPriceUSD ?? undefined,
      curveProgress: tokenDb.curveProgress ?? undefined,
      curveLimit: tokenDb.curveLimit ?? undefined,
      priceChange24h: tokenDb.priceChange24h ?? undefined,
      price24hAgo: tokenDb.price24hAgo ?? undefined,
      volume24h: tokenDb.volume24h ?? undefined,
      inferenceCount: tokenDb.inferenceCount ?? undefined,
      lastVolumeReset: tokenDb.lastVolumeReset ?? undefined,
      lastPriceUpdate: tokenDb.lastPriceUpdate ?? undefined,
      holderCount: tokenDb.holderCount ?? undefined,
      txId: tokenDb.txId ?? undefined,
      withdrawnAmounts: tokenDb.withdrawnAmounts
        ? JSON.parse(tokenDb.withdrawnAmounts)
        : undefined,
      poolInfo: tokenDb.poolInfo ? JSON.parse(tokenDb.poolInfo) : undefined,
      migration:
        typeof tokenDb.migration === "string"
          ? JSON.parse(tokenDb.migration)
          : (tokenDb.migration ?? {}),
      tokenSupply: tokenDb.tokenSupply ?? undefined,
      tokenSupplyUiAmount: tokenDb.tokenSupplyUiAmount ?? undefined,
      tokenDecimals: tokenDb.tokenDecimals ?? undefined,
      lastSupplyUpdate: tokenDb.lastSupplyUpdate ?? undefined,
    };
    return token;
  }
  return null;
}

export async function executeMigrationStep(
  env: Env,
  token: TokenData,
  step: MigrationStep,
  nextStep: MigrationStep,
  retryCount: number = 3,
  delay: number = 2000,
): Promise<MigrationStepResult> {
  logger.log(`[Migrate] Starting ${step.name} for token ${token.mint}`);

  const result = await retryOperation(() => step.fn(token), retryCount, delay);

  // Update token migration
  token.migration = token.migration ?? {};
  (token.migration as Record<string, any>)[step.name] = {
    status: "success", 
    txId: result.txId,
    updatedAt: new Date().toISOString(),
  };
  Object.assign(token, result.extraData);
  console.log(`${step.name} result:`, result);
  // Update the DB record
  const tokenData: Partial<TokenData> = {
    mint: token.mint,
    migration: token.migration,
    lastUpdated: new Date().toISOString(),
    status: "migrating",
    ...result.extraData,
  };
  const nextStepName = nextStep ? nextStep.name : null;
  token.migration.lastStep = nextStepName ?? "done";

  await updateTokenInDB(env, tokenData);
  // await saveMigrationState(env, token, step.name);

  const ws = getWebSocketClient();
  if (step.eventName) {
    ws.to(`token-${token.mint}`).emit(step.eventName, token);
  }

  logger.log(
    `[Migrate] ${step.name} successful for token ${token.mint} txId: ${result.txId}`,
  );
  return result;
}

export async function acquireMigrationLock(
  env: Env,
  token: TokenData,
): Promise<boolean> {
  const migration = token.migration ? token.migration : {};
  if (migration.lock) {
    return false;
  }
  migration.lock = true;
  token.migration = migration;

  await updateTokenInDB(env, {
    mint: token.mint,
    migration: token.migration,
    lastUpdated: new Date().toISOString(),
  });

  return true;
}
export async function releaseMigrationLock(
  env: Env,
  token: TokenData,
): Promise<void> {
  const migration = token.migration ? token.migration : {};
  if (migration.lock) {
    delete migration.lock;
  }
  token.migration = migration;

  await updateTokenInDB(env, {
    mint: token.mint,
    migration: token.migration,
    lastUpdated: new Date().toISOString(),
  });
}
export async function saveMigrationState(
  env: Env,
  token: TokenData,
  step: string,
) {
  const db = getDB();
  const updatedMigration = {
    ...token.migration,
    lastStep: step,
  };

  await db
    .update(tokens)
    .set({
      migration: JSON.stringify(updatedMigration),
      lastUpdated: new Date(),
    })
    .where(eq(tokens.mint, token.mint));
}

export async function getMigrationState(env: Env, token: TokenData) {
  const db = getDB();

  const tokenRecords = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, token.mint))
    .limit(1)
    .execute();

  if (tokenRecords.length > 0) {
    const tokenRecord = tokenRecords[0];
    const migration =
      typeof tokenRecord.migration === "string"
        ? JSON.parse(tokenRecord.migration)
        : tokenRecord.migration;

    if (migration && tokenRecord.status !== "locked") {
      return migration;
    }
  }
  return null;
}

export async function checkMigratingTokens(env: Env, limit: number) {
  try {
    const db = getDB();
    const migratingTokens = await db
      .select()
      .from(tokens)
      .where(and(eq(tokens.status, "migrating")))
      .execute();

    const connection = new Connection(
      env.NETWORK === "devnet"
        ? env.DEVNET_SOLANA_RPC_URL
        : env.MAINNET_SOLANA_RPC_URL,
    );
    const wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(env.WALLET_PRIVATE_KEY)),
    );
    const provider = new AnchorProvider(
      connection,
      new Wallet(wallet),
      AnchorProvider.defaultOptions(),
    );
    const program = new Program<RaydiumVault>(
      raydium_vault_IDL as any,
      provider,
    );
    const autofunProgram = new Program<Autofun>(IDL, provider);

    const tokenMigrator = new TokenMigrator(
      env,
      connection,
      new Wallet(wallet),
      program,
      autofunProgram,
      provider,
    );

    // Filter out tokens that have migration as null or empty object or migration.status is not locked
    const filteredTokens = migratingTokens.filter((token) => {
      const migration = token.migration ? JSON.parse(token.migration) : null;
      return (
        migration &&
        (typeof migration === "object" || migration.status !== "locked")
      );
    });
    // Limit the number of tokens to the specified limit
    const finalList = filteredTokens.slice(0, limit);

    for (const token of finalList) {
      const tokenM = await getToken(env, token.mint);
      // await tokenMigrator.migrateToken(tokenM!);
    }
  } catch (error) {
    logger.error(`Error fetching migrating tokens: ${error}`);
    throw new Error("Failed to fetch migrating tokens");
  }
}
