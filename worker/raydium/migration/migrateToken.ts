import { logger } from "../../logger";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { updateTokenInDB } from "../../cron";
import {
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  DEV_LOCK_CPMM_AUTH,
  mul,
  LOCK_CPMM_AUTH,
} from "@raydium-io/raydium-sdk-v2";
import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
import { initSdk, txVersion } from "../raydium-config";
import { withdrawTx, execWithdrawTx } from "../withdraw";
import { NATIVE_MINT } from "@solana/spl-token";
import { Env } from "../../env";
import { depositToRaydiumVault } from "../raydiumVault";
import { sendNftTo } from "../utils";
import { retryOperation } from "../utils";
import { RaydiumVault } from "../types/raydium_vault";
import { getWebSocketClient } from "../../websocket-client";
import { Autofun } from "../../target/types/autofun";
import { TokenData } from "../types/tokenData";
import {
  getMigrationState,
  MigrationStep,
  executeMigrationStep,
  acquireMigrationLock,
  releaseMigrationLock,
  LockResult,
} from "./migrations";

export class TokenMigrator {
  constructor(
    public env: Env,
    public connection: Connection,
    public wallet: Keypair,
    public program: Program<RaydiumVault>,
    public autofunProgram: Program<Autofun>,
    public provider: AnchorProvider,
  ) {}
  FEE_PERCENTAGE = 10; // 10% fee for pool creation

  async callResumeWorker(token: TokenData) {
    try {
      await releaseMigrationLock(this.env, token);
      await this.migrateToken(token);
    } catch (error) {
      logger.error(
        `[Migrate] Error releasing lock for token ${token.mint}: ${error}`,
      );
    }
  }
  private getMigrationSteps(): MigrationStep[] {
    return [
      {
        name: "withdraw",
        eventName: "migrationStarted",
        fn: this.performWithdraw.bind(this),
      },
      {
        name: "createPool",
        eventName: "poolCreated",
        fn: this.performCreatePool.bind(this),
      },
      {
        name: "lockLP",
        eventName: "lpLocked",
        fn: this.performLockLP.bind(this),
      },
      {
        name: "sendNft",
        fn: (token: any) =>
          this.sendNftToManagerMultisig(
            token,
            token.nftMinted?.split(",")[1] ?? "",
            this.wallet,
            new PublicKey(this.env.MANAGER_MULTISIG_ADDRESS!),
          ).then((result) => result),
      },
      {
        name: "depositNft",
        eventName: "nftDeposited",
        fn: (token: any) =>
          this.depositNftToRaydiumVault(
            token,
            (token.nftMinted ?? "").split(",")[0],
            new PublicKey(token.creator),
          ).then((result) => result),
      },
      {
        name: "finalize",
        fn: this.finalizeMigration.bind(this),
      },
    ];
  }

  async migrateToken(token: TokenData): Promise<void> {
    try {
      if (token.migration) {
        const migrationData =
          typeof token.migration === "string"
            ? JSON.parse(token.migration)
            : token.migration;
        if (migrationData.lock) {
          logger.log(
            `[Migrate] Migration already in progress for token ${token.mint}. Deferring additional execution.`,
          );
          return;
        }
      }
      token.migration = token.migration || {};
      const ws = getWebSocketClient(this.env);
      const lockAcquired = await acquireMigrationLock(this.env, token);
      if (!lockAcquired) {
        logger.log(
          `[Migrate] Unable to acquire lock for token ${token.mint}. Deferring to resume operation.`,
        );
        await this.callResumeWorker(token);
        return;
      }
      const steps = this.getMigrationSteps();
      for (const step of steps) {
        if (token.migration[step.name]?.status === "success") {
          logger.log(
            `[Migrate] ${step.name} already processed for token ${token.mint}`,
          );
          continue;
        }
        // execute the step with retry logic, update DB, process event, save step.
        await executeMigrationStep(this.env, token, step);
      }
      // Final update
      token.status = "locked";
      token.lockedAt = new Date().toISOString();
      await updateTokenInDB(this.env, {
        mint: token.mint,
        status: "locked",
        lockedAt: token.lockedAt,
        lastUpdated: new Date().toISOString(),
      });

      ws.to(`token-${token.mint}`).emit("updateToken", token);
      logger.log(`[Migrate] Migration finalized for token ${token.mint}`);
    } catch (error) {
      logger.error(`[Migrate] Migration failed for token ${token.mint}:`);
      console.error(error);
      await updateTokenInDB(this.env, {
        mint: token.mint,
        status: "migration_failed",
        lastUpdated: new Date().toISOString(),
      });
      this.callResumeWorker(token);
    }
  }

  async performWithdraw(token: any): Promise<{
    txId: string;
    extraData: {
      withdrawnAmounts: { withdrawnSol: number; withdrawnTokens: number };
    };
  }> {
    logger.log(`[Withdraw] Withdrawing funds for token ${token.mint}`);
    const transaction = await withdrawTx(
      this.wallet.publicKey,
      new PublicKey(token.mint),
      this.connection,
      this.autofunProgram,
    );

    transaction.instructions = [...transaction.instructions];

    const { signature: txId, logs } = await execWithdrawTx(
      transaction,
      this.connection,
      this.wallet,
    );
    const withdrawnAmounts = this.parseWithdrawLogs(logs);
    return { txId, extraData: { withdrawnAmounts } };
  }

  private parseWithdrawLogs(withdrawLogs: string[]): {
    withdrawnSol: number;
    withdrawnTokens: number;
  } {
    let withdrawnSol = 0;
    let withdrawnTokens = 0;
    withdrawLogs.forEach((log) => {
      if (log.includes("withdraw lamports:")) {
        withdrawnSol = Number(
          log.replace("Program log: withdraw lamports:", "").trim(),
        );
      }
      if (log.includes("withdraw token:")) {
        withdrawnTokens = Number(
          log.replace("Program log: withdraw token:", "").trim(),
        );
      }
    });
    return { withdrawnSol, withdrawnTokens };
  }

  async performCreatePool(
    token: any,
  ): Promise<{ txId: string; extraData: { marketId: string; poolInfo: any } }> {
    const raydium = await initSdk({ env: this.env, loadToken: false });
    const mintA = await raydium.token.getTokenInfo(token.mint);
    const mintB = await raydium.token.getTokenInfo(NATIVE_MINT);

    const feeConfigs = await raydium.api.getCpmmConfigs();
    if (raydium.cluster === "devnet") {
      feeConfigs.forEach((config: any) => {
        config.id = getCpmmPdaAmmConfigId(
          DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
          config.index,
        ).publicKey.toBase58();
      });
    }
    const feeConfig =
      raydium.cluster === "devnet" ? feeConfigs[0] : feeConfigs[1];

    const withdrawnAmounts = token.withdrawnAmounts;
    if (!withdrawnAmounts)
      throw new Error("No withdrawn amounts found for pool creation");

    const mintConstantFee = new BN(6 * 1e9); // 6 SOL
    const withdrawnTokensBN = new BN(withdrawnAmounts.withdrawnTokens);
    const withdrawnSolBN = new BN(withdrawnAmounts.withdrawnSol);

    const solFeeAmount = withdrawnSolBN.sub(mintConstantFee);
    const remainingTokens = withdrawnTokensBN;
    const remainingSol = withdrawnSolBN.sub(solFeeAmount);

    logger.log(`[Pool] Creating pool for token ${token.mint}`);
    const poolCreation = await raydium.cpmm.createPool({
      programId:
        raydium.cluster === "devnet"
          ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM
          : CREATE_CPMM_POOL_PROGRAM,
      poolFeeAccount:
        raydium.cluster === "devnet"
          ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC
          : CREATE_CPMM_POOL_FEE_ACC,
      mintA,
      mintB,
      mintAAmount: remainingTokens,
      mintBAmount: remainingSol,
      startTime: new BN(0),
      feeConfig,
      associatedOnly: true,
      ownerInfo: { useSOLBalance: true },
      txVersion,
    });

    const { txId } = await poolCreation.execute({ sendAndConfirm: true });
    const poolAddresses = {
      id: poolCreation.extInfo.address.poolId.toString(),
      lpMint: poolCreation.extInfo.address.lpMint.toString(),
      baseVault: poolCreation.extInfo.address.vaultA.toString(),
      quoteVault: poolCreation.extInfo.address.vaultB.toString(),
    };

    return {
      txId,
      extraData: {
        marketId: poolAddresses.id,
        poolInfo: poolAddresses,
      },
    };
  }

  async lockPrimaryLP(
    raydium: any,
    poolInfo: any,
    poolKeys: any,
    primaryAmount: any,
  ): Promise<{ txId: string; nftMint: string }> {
    const { execute: lockExecutePrimary, extInfo: lockExtInfoPrimary } =
      await raydium.cpmm.lockLp({
        poolInfo,
        poolKeys,
        lpAmount: primaryAmount,
        withMetadata: true,
        txVersion,
        computeBudgetConfig: {
          units: 300000,
          microLamports: 0.0001 * 1e9,
        },
        programId:
          raydium.cluster === "devnet"
            ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM
            : CREATE_CPMM_POOL_PROGRAM,
        authProgram:
          raydium.cluster === "devnet" ? DEV_LOCK_CPMM_AUTH : LOCK_CPMM_AUTH,
      });
    const { txId: lockTxIdPrimary } = (await retryOperation(
      () => lockExecutePrimary({ sendAndConfirm: true }),
      3,
      2000,
    )) as LockResult;
    const nftMintPrimary = lockExtInfoPrimary.nftMint.toString();
    logger.log(`[Lock] Primary LP lock txId: ${lockTxIdPrimary}`);

    return { txId: lockTxIdPrimary, nftMint: nftMintPrimary };
  }

  async lockSecondaryLP(
    raydium: any,
    poolInfo: any,
    poolKeys: any,
    secondaryAmount: any,
  ): Promise<{ txId: string; nftMint: string }> {
    const { execute: lockExecuteSecondary, extInfo: lockExtInfoSecondary } =
      await raydium.cpmm.lockLp({
        poolInfo,
        poolKeys,
        lpAmount: secondaryAmount,
        withMetadata: true,
        txVersion,
        computeBudgetConfig: {
          units: 300000,
          microLamports: 0.0001 * 1e9,
        },
        programId:
          raydium.cluster === "devnet"
            ? DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM
            : CREATE_CPMM_POOL_PROGRAM,
        authProgram:
          raydium.cluster === "devnet" ? DEV_LOCK_CPMM_AUTH : LOCK_CPMM_AUTH,
      });
    const { txId: lockTxIdSecondary } = (await retryOperation(
      () => lockExecuteSecondary({ sendAndConfirm: true }),
      3,
      2000,
    )) as LockResult;
    const nftMintSecondary = lockExtInfoSecondary.nftMint.toString();
    logger.log(`[Lock] Secondary LP lock txId: ${lockTxIdSecondary}`);

    return { txId: lockTxIdSecondary, nftMint: nftMintSecondary };
  }

  async performLockLP(token: any): Promise<{
    txId: string;
    extraData: { lockLpTxId: string; nftMinted: string };
  }> {
    const raydium = await initSdk({ env: this.env, loadToken: false });
    const poolId = token.marketId;
    const poolInfoResult = await this.fetchPoolInfoWithRetry(raydium, poolId);
    const poolInfo = poolInfoResult.poolInfo;
    const poolKeys = poolInfoResult.poolKeys;

    await raydium.account.fetchWalletTokenAccounts();
    const lpMintStr = poolInfo.lpMint.address;
    const lpAccount = raydium.account.tokenAccounts.find(
      (a: any) => a.mint.toBase58() === lpMintStr,
    );
    if (!lpAccount) {
      throw new Error(`No LP balance found for pool: ${poolInfo.id}`);
    }

    const PRIMARY_LOCK_PERCENTAGE = Number(
      process.env.PRIMARY_LOCK_PERCENTAGE || "90",
    );
    const SECONDARY_LOCK_PERCENTAGE = Number(
      process.env.SECONDARY_LOCK_PERCENTAGE || "10",
    );
    if (PRIMARY_LOCK_PERCENTAGE + SECONDARY_LOCK_PERCENTAGE !== 100) {
      throw new Error("Lock percentages must sum to 100");
    }
    const totalLPAmount = lpAccount.amount;
    const primaryAmount = totalLPAmount.muln(PRIMARY_LOCK_PERCENTAGE).divn(100);
    const secondaryAmount = totalLPAmount
      .muln(SECONDARY_LOCK_PERCENTAGE)
      .divn(100);

    const primaryLock = await this.lockPrimaryLP(
      raydium,
      poolInfo,
      poolKeys,
      primaryAmount,
    );
    const secondaryLock = await this.lockSecondaryLP(
      raydium,
      poolInfo,
      poolKeys,
      secondaryAmount,
    );

    const aggregatedTxId = `${primaryLock.txId},${secondaryLock.txId}`;
    const aggregatedNftMint = `${primaryLock.nftMint},${secondaryLock.nftMint}`;

    const tokenData: Partial<TokenData> = {
      mint: token.mint,
      lockId: aggregatedTxId,
      nftMinted: aggregatedNftMint,
      lockedAmount: totalLPAmount.toString(),
      status: "locked",
      lastUpdated: new Date().toISOString(),
      lockedAt: new Date().toISOString(),
    };
    await updateTokenInDB(this.env, tokenData);

    return {
      txId: aggregatedTxId,
      extraData: { lockLpTxId: aggregatedTxId, nftMinted: aggregatedNftMint },
    };
  }

  // send the 10% to the manager multisig
  async sendNftToManagerMultisig(
    token: any,
    nftMinted: string,
    signerWallet: Keypair,
    multisig: PublicKey,
  ): Promise<{ txId: string; extraData: object }> {
    const txSignature = await sendNftTo(
      signerWallet,
      multisig,
      new PublicKey(nftMinted), // 10% NFT
      this.connection,
    );

    logger.log(
      `[Send] Sending NFT to manager multisig for token ${token.mint} with NFT ${nftMinted}`,
    );
    return { txId: txSignature, extraData: {} };
  }
  // send the 90% to our raydium vault
  async depositNftToRaydiumVault(
    token: any,
    nftMinted: string,
    claimer_address: PublicKey,
  ): Promise<{ txId: string; extraData: object }> {
    const txSignature = await depositToRaydiumVault(
      this.provider,
      this.wallet,
      this.program,
      new PublicKey(nftMinted), // 90% NFT
      claimer_address,
    );

    logger.log(
      `[Deposit] Depositing NFT to Raydium vault for token ${token.mint} with NFT ${nftMinted}`,
    );
    return { txId: txSignature, extraData: {} };
  }

  async finalizeMigration(token: any): Promise<{ txId: string }> {
    return { txId: "finalized" };
  }

  private async fetchPoolInfoWithRetry(
    raydium: any,
    poolId: string,
  ): Promise<{ poolInfo: any; poolKeys: any }> {
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let poolInfo: any = null;
    let poolKeys: any;
    while (!poolInfo && retryCount < MAX_RETRIES) {
      try {
        if (raydium.cluster === "devnet") {
          const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
          poolInfo = data.poolInfo;
          poolKeys = data.poolKeys;
        } else {
          const data = await raydium.api.fetchPoolById({ ids: poolId });
          if (!data || data.length === 0) {
            throw new Error("Pool info not found");
          }
          poolInfo = data[0];
        }
      } catch (error) {
        retryCount++;
        if (retryCount === MAX_RETRIES) {
          throw error;
        }
        await new Promise((res) => setTimeout(res, 10000)); // wait 10 seconds before retrying
      }
    }
    return { poolInfo, poolKeys };
  }
}
