import { initSdk, txVersion } from "@autodotfun/raydium/src/raydium-config";
import { depositToRaydiumVault } from "@autodotfun/raydium/src/raydiumVault";
import { TokenData } from "@autodotfun/raydium/src/types/tokenData";
import { retryOperation, sendNftTo, sendSolTo } from "@autodotfun/raydium/src/utils";
import { execWithdrawTxSafe, withdrawTx } from "@autodotfun/raydium/src/withdraw";
import { Wallet } from "@autodotfun/server/src/tokenSupplyHelpers/customWallet";
import { logger } from "@autodotfun/server/src/util";
import { Autofun } from "@autodotfun/types/types/autofun";
import { RaydiumVault } from "@autodotfun/types/types/raydium_vault";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  CREATE_CPMM_POOL_FEE_ACC,
  CREATE_CPMM_POOL_PROGRAM,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
} from "@raydium-io/raydium-sdk-v2";
import { NATIVE_MINT } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { getDB, tokens } from "../db";
import { Env } from "../env";
import { RedisCacheService } from "../redis";
import {
  LockResult,
  MigrationStep,
  getToken,
  releaseMigrationLock,
  // safePostUpdate,
  safeUpdateTokenInDB
} from "./migrations";

function asBN(x: BN | string) {
  // Redis stored hex strings, so we parse as hex
  return typeof x === "string" ? new BN(x, "hex") : x;
}
export class TokenMigrator {
  constructor(
    public connection: Connection,
    public wallet: Wallet,
    public program: Program<RaydiumVault>,
    public autofunProgram: Program<Autofun>,
    public provider: AnchorProvider,
    public redisCache: RedisCacheService,
  ) { }

  async resetMigration(mint: string): Promise<void> {
    const stepNames = this.getMigrationSteps().map((s) => s.name);

    const keys = [
      `migration:${mint}:currentStep`,
      `migration:${mint}:lock`,
      ...stepNames.map((step) => `migration:${mint}:step:${step}:result`),
    ];

    for (const key of keys) {
      await this.redisCache.del(key);
    }

    logger.log(`[Migrate] Reset Redis state for token ${mint}`);
  }
  async getMigrationState(mint: string): Promise<any> {
    const stepNames = this.getMigrationSteps().map((s) => s.name);

    const currentStep = await this.redisCache.get(`migration:${mint}:currentStep`);
    const lock = await this.redisCache.get(`migration:${mint}:lock`);
    const finishedSteps: Record<string, any> = {};

    for (const step of stepNames) {
      const res = await this.redisCache.get(`migration:${mint}:step:${step}:result`);
      if (res) {
        finishedSteps[step] = JSON.parse(res);
      }
    }

    return {
      mint,
      currentStep,
      lock,
      finishedSteps,
    };
  }

  async forceResumeAtStep(mint: string, step: string): Promise<void> {
    const validSteps = this.getMigrationSteps().map((s) => s.name);
    if (!validSteps.includes(step)) {
      throw new Error(`Invalid step "${step}". Valid steps: ${validSteps.join(", ")}`);
    }

    await this.redisCache.set(`migration:${mint}:currentStep`, step);
    logger.log(`[Migrate] Forced resume of token ${mint} at step "${step}"`);
  }

  async resumeMigrationsOnStart(): Promise<void> {
    logger.log("[Migrate] Scanning for ongoing migrations on startup...");

    // find all keys like "migration:<mint>:lock"
    const lockKeys: string[] = await this.redisCache.keys("migration:*:lock");
    if (lockKeys.length === 0) {
      logger.log("[Migrate] No in-flight migrations found.");
      return;
    }

    for (const lockKey of lockKeys) {
      console.log("🔑  raw lockKey:", lockKey);
      const isLocked = await this.redisCache.get(lockKey);
      const parts = lockKey.split(":");
      if (parts.length < 4) {
        console.warn("⚠️  Unexpected key format, skipping:", lockKey);
        continue;
      }
      // folows this schema ["mainnet","migration", ...<mintParts>..., "lock"]
      const mint = parts.slice(2, parts.length - 1).join(":");
      if (isLocked !== "true") {
        console.log(`🔒  ${lockKey} is not set to "true", skipping.`);
        await this.redisCache.set(`migration:${mint}:lock`, "true");
        // continue;
      }


      console.log(`[Migrate] Found locked token: ${mint}`);
      logger.log(`[Migrate] Resuming migration for token ${mint}`);

      const token = await getToken(mint);
      if (!token) {
        logger.error(`[Migrate] Token ${mint} not found in DB. Skipping.`);
        continue;
      }

      try {
        // clear the 'lock' 
        await this.redisCache.set(lockKey, "false");
        await this.migrateToken(token);
      } catch (err) {
        logger.error(`[Migrate] Error resuming migration for ${mint}:`, err);

        await this.redisCache.set(lockKey, "false");
      }
    }

    logger.log("[Migrate] Resume complete.");
  }
  async printMigrationState(mint: string): Promise<void> {
    const state = await this.getMigrationState(mint);
    console.log(JSON.stringify(state, null, 2));
  }


  async callResumeWorker(token: TokenData) {
    try {
      await releaseMigrationLock(token);
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
        name: "initLockLP",
        eventName: "lpPoolFetched",
        fn: this.initRaydiumSdkAndFetchPoolInfo.bind(this),
      },
      {
        name: "lockPrimaryLP",
        eventName: "lpPrimaryLocked",
        fn: (token: any) =>
          this.lockPrimaryLPTransaction(
            token.poolInfo,
            token.poolKeys,
            token.primaryAmount,      // ← use the saved BN
          ).then((result) => result),
      },
      {
        name: "lockSecondaryLP",
        eventName: "lpSecondaryLocked",
        fn: (token: any) =>
          this.lockSecondaryLPTransaction(
            token.poolInfo,
            token.poolKeys,
            token.secondaryAmount,    // ← use the saved BN
          ).then((result) => result),
      },
      {
        name: "finalizeLockLP",
        eventName: "lpLocked",
        fn: (token: any) =>
          this.finalizeLockLP(
            token,
            token.primary,
            token.secondary,
            token.lpAccount.amount,
          ).then((result) => result),
      },
      {
        name: "sendNft",
        fn: (token: any) =>
          this.sendNftToManagerMultisig(
            token,
            token.nftMinted?.split(",")[1] ?? "",
            this.wallet.payer as Keypair,
            new PublicKey(process.env.MANAGER_MULTISIG_ADDRESS!),
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
      {
        name: "collectFees",
        eventName: "feesCollected",
        fn: (token: any) => this.collectFee(token).then((result) => result),
      },
      {
        name: "done",
        eventName: "migrationDone",
        fn: (token: any) => {
          console.log("token.migration", token.migration);
          return Promise.resolve({ txId: "", extraData: {} });
        },
      },
    ];
  }

  async migrateToken(token: TokenData,): Promise<void> {
    const mint = token.mint;
    try {
      const lockKey = `migration:${mint}:lock`;
      const lock = await this.redisCache.get(lockKey);
      if (lock === "true") {
        logger.log(`[Migrate] Token ${token.mint} is locked. Skipping.`);
        return;
      }

      // Lock the token
      await this.redisCache.set(lockKey, "true");

      const allSteps: MigrationStep[] = this.getMigrationSteps();
      const stepNames = allSteps.map((s) => s.name);
      const stepKey = `migration:${mint}:currentStep`;
      let currentStep = await this.redisCache.get(stepKey);

      // fallback if no currentStep is in Redis
      if (!currentStep || !stepNames.includes(currentStep)) {
        currentStep = stepNames[0];
        await this.redisCache.set(stepKey, currentStep);
      }

      const stepIndex = stepNames.indexOf(currentStep);
      const step = allSteps[stepIndex];
      const nextStep = allSteps[stepIndex + 1] || null;
      for (const stepName of stepNames) {
        const raw = await this.redisCache.get(`migration:${mint}:step:${stepName}:result`);
        if (!raw) continue;
        const { extraData } = JSON.parse(raw);
        if (extraData) Object.assign(token, extraData);
      }
      const stepResultKey = `migration:${mint}:step:${step.name}:result`;
      const stepResultExists = await this.redisCache.get(stepResultKey);
      if (stepResultExists) {
        logger.log(`[Migrate] Step "${step.name}" already completed. Moving on.`);
        if (nextStep) {
          await this.redisCache.set(stepKey, nextStep.name);

          return this.migrateToken(token); // resume with next step
        } else {
          logger.log(`[Migrate] Migration completed for token ${mint}.`);
          await this.redisCache.set(lockKey, "false");
          return;
        }
      }

      logger.log(`[Migrate] Running step "${step.name}" for token ${mint}`);
      const result = await retryOperation(() => step.fn(token), 3, 2000);
      if (step.name !== "withdraw") {
        token.status = "locked";
      } else {
        token.status = "migrating";
      }
      (token.migration as Record<string, any>)[step.name] = {
        status: "success",
        txId: result.txId,
        updatedAt: new Date().toISOString(),
      };

      // Save to DB
      Object.assign(token, result.extraData);
      await safeUpdateTokenInDB({
        ...token,
        ...result.extraData,
        lastUpdated: new Date().toISOString(),
      });

      // Save to Redis
      await this.redisCache.set(
        stepResultKey,
        JSON.stringify({ txId: result.txId, extraData: result.extraData })
      );

      if (nextStep) {
        await this.redisCache.set(stepKey, nextStep.name);
        await this.redisCache.set(lockKey, "false");
        return this.migrateToken(token); // continue
      } else {
        await this.redisCache.set(lockKey, "false");
        logger.log(`[Migrate] All steps completed for token ${mint}`);
      }

    } catch (err) {
      logger.error(`[Migrate] Error migrating token ${token.mint}:`, err);
      await this.redisCache.set(`migration:${token.mint}:lock`, "false");
      await safeUpdateTokenInDB({
        ...token,
        mint: token.mint,
        lastUpdated: new Date().toISOString(),
      });
      const RETRY_DELAY_MS = 60_000;

      logger.log(`[Migrate] Will retry token ${mint} in ${RETRY_DELAY_MS / 1000}s`);
      setTimeout(() => {
        this.migrateToken(token).catch(e =>
          logger.error(`[Migrate] Retry for ${mint} failed:`, e)
        );
      }, RETRY_DELAY_MS);

      // done with this invocation
      return;
    }
  }

  async performWithdraw(
    token: any
  ): Promise<{
    txId: string;
    extraData: { withdrawnAmounts: { withdrawnSol: number; withdrawnTokens: number } };
  }> {
    logger.log(`[Withdraw] Starting for token ${token.mint}`);

    // 1) build the withdrawal transaction
    const tx: Transaction = await withdrawTx(
      this.wallet.publicKey,
      new PublicKey(token.mint),
      this.connection as any,
      this.autofunProgram as any,
    );
    tx.instructions = [...tx.instructions];

    const { signature: txId, logs } = await execWithdrawTxSafe(
      tx,
      this.connection,
      this.wallet,
      token.mint,
    );
    const withdrawnAmounts = this.parseWithdrawLogs(logs);


    // 4) fire & forget your CF D1 update

    (async () => {
      try {

        await safeUpdateTokenInDB({
          mint: token.mint,
          withdrawnAmounts: {
            withdrawnSol: withdrawnAmounts.withdrawnSol,
            withdrawnTokens: withdrawnAmounts.withdrawnTokens,
          },
          migration: token.migration,
          status: token.status,
          lockedAt: token.lockedAt,
          txId,

        });

        logger.log(`[Withdraw] Migration update POSTed for ${token.mint}`);
      } catch (httpErr) {
        console.error(`[Withdraw] CF update failed:`, httpErr);
      }
    })();


    return {
      txId,
      extraData: { withdrawnAmounts },
    };
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
    const raydium = await initSdk({ loadToken: false });
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

    const mintConstantFee = new BN(Number(process.env.FIXED_FEE ?? 6) * 1e9); // 6 SOL

    const withdrawnTokensBN = new BN(withdrawnAmounts.withdrawnTokens);
    console.log("withdrawnSol", withdrawnAmounts.withdrawnSol);
    const withdrawnSolBN = new BN(withdrawnAmounts.withdrawnSol);

    const remainingTokens = withdrawnTokensBN;
    const remainingSol = withdrawnSolBN.sub(mintConstantFee);
    {
      /* Todo: Malibu - we need to add a step at the end to send the mintConstantFee Sol to the fee wallet - for now it will stay in the wallet*/
    }
    console.log("remainingSol", remainingSol.toString());

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
    try {
      // await safePostUpdate(
      //   process.env,
      //   {
      //     mint: token.mint,
      //     marketId: poolAddresses.id,
      //     poolInfo: poolAddresses,
      //     migration: token.migration,
      //     status: "locked",
      //     txId,
      //     step: "createPool",
      //   },
      // )

    } catch (err) {
      console.error(
        `[Pool] Failed to POST migration/update for ${token.mint}:`,
        err
      );
    }

    return {
      txId,
      extraData: {
        marketId: poolAddresses.id,
        poolInfo: poolAddresses,
      },
    };
  }


  async initRaydiumSdkAndFetchPoolInfo(token: TokenData): Promise<{
    txId: string,
    extraData: {
      poolInfo: any;
      poolKeys: any;
      lpAccount: any;
      primaryAmount: BN | string
      secondaryAmount: BN | string;
      totalAmount: BN | string;
    }
  }> {
    const raydium = await initSdk({
      loadToken: false,
    });

    if (!raydium) throw new Error("Raydium SDK init failed");
    const poolId = token.marketId;
    if (!poolId) {
      throw new Error(`No poolId found for token: ${token.mint}`);
    }
    const poolInfoResult = await this.fetchPoolInfoWithRetry(raydium, poolId);
    if (!poolInfoResult) {
      throw new Error(`Failed to fetch pool info for poolId: ${token.marketId}`);
    }

    await raydium.account.fetchWalletTokenAccounts();
    const lpMintStr = poolInfoResult.poolInfo.lpMint.address;
    const lpAccount = raydium.account.tokenAccounts.find(
      (a: any) => a.mint.toBase58() === lpMintStr,
    );
    if (!lpAccount) throw new Error(`No LP balance found for pool: ${poolId}`);
    const totalLP = lpAccount.amount as BN;
    const primaryAmount = totalLP.muln(Number(process.env.PRIMARY_LOCK_PERCENTAGE ?? 90)).divn(100);
    const secondaryAmount = totalLP.sub(primaryAmount);
    return {
      txId: "",
      extraData: {
        poolInfo: poolInfoResult.poolInfo,
        poolKeys: poolInfoResult.poolKeys,
        lpAccount,
        primaryAmount,
        secondaryAmount,
        totalAmount: totalLP,
      },
    }

  }


  async finalizeLockLP(
    token: TokenData,
    primary: { txId: string; nftMint: string },
    secondary: { txId: string; nftMint: string },
    totalAmount: any
  ): Promise<{
    txId: string;
    extraData: { lockLpTxId: string; nftMinted: string };
  }> {
    const aggregatedTxId = `${primary.txId},${secondary.txId}`;
    const aggregatedNftMint = `${primary.nftMint},${secondary.nftMint}`;
    const amount = asBN(totalAmount);

    const tokenData: Partial<TokenData> = {
      mint: token.mint,
      lockId: aggregatedTxId,
      nftMinted: aggregatedNftMint,
      lockedAmount: amount.toString(),
      status: "locked",
      lastUpdated: new Date().toISOString(),
      lockedAt: new Date(),
    };
    await safeUpdateTokenInDB(tokenData);
    // await safePostUpdate(process.env, {
    //   mint: token.mint,
    //   migration: token.migration,
    //   status: "locked",
    //   lockedAt: tokenData.lockedAt,
    //   lockLpTxId: aggregatedTxId,
    //   nftMinted: aggregatedNftMint,
    //   step: "lockLP",
    //   txId: aggregatedTxId,
    // });

    return {
      txId: aggregatedTxId,
      extraData: {
        lockLpTxId: aggregatedTxId,
        nftMinted: aggregatedNftMint,
      },
    };
  }

  async lockPrimaryLPTransaction(
    poolInfo: any,
    poolKeys: any,
    primaryAmount: BN | string
  ): Promise<{ txId: string; extraData: { primary: { txId: string; nftMint: string } } }> {
    console.log("Performing primary LP lock", primaryAmount.toString());
    const amountBn = asBN(primaryAmount);
    const raydium = await initSdk({ loadToken: false });
    const { execute, extInfo } = await raydium.cpmm.lockLp({
      poolInfo,
      lpAmount: amountBn,
      withMetadata: true,
      txVersion,
      computeBudgetConfig: {
        units: 300000,
        microLamports: 0.0001 * 1e9,
      },
    });

    const { txId } = (await retryOperation(
      () => execute({ skipPreflight: false }),
      5,
      4000
    )) as LockResult;

    const nftMint = extInfo.nftMint.toString();
    logger.log(`[Lock] Primary LP lock txId: ${txId}, nftMint: ${nftMint}`);

    return {
      txId,
      extraData: {
        primary: { txId, nftMint },
      },
    };
  }

  async lockSecondaryLPTransaction(
    poolInfo: any,
    poolKeys: any,
    secondaryAmount: BN | string
  ): Promise<{ txId: string; extraData: { secondary: { txId: string; nftMint: string } } }> {
    console.log("Performing secondary LP lock", secondaryAmount.toString());
    const amountBn = asBN(secondaryAmount);

    const raydium = await initSdk({ loadToken: false });

    const { execute, extInfo } = await raydium.cpmm.lockLp({
      poolInfo,
      lpAmount: amountBn,
      withMetadata: true,
      txVersion,
      computeBudgetConfig: {
        units: 300000,
        microLamports: 0.0001 * 1e9,
      },
    });

    const { txId } = (await retryOperation(
      () => execute({ skipPreflight: false }),
      5,
      4000
    )) as LockResult;

    const nftMint = extInfo.nftMint.toString();
    logger.log(`[Lock] Secondary LP lock txId: ${txId}, nftMint: ${nftMint}`);

    return {
      txId,
      extraData: {
        secondary: { txId, nftMint },
      },
    };
  }


  // send the 10% to the manager multisig
  async sendNftToManagerMultisig(
    token: any,
    nftMinted: string,
    signerWallet: Keypair,
    multisig: PublicKey,
  ): Promise<{ txId: string; extraData: object }> {
    console.log("Sending NFT to manager multisig", nftMinted);
    if (!signerWallet) {
      signerWallet = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.EXECUTOR_PRIVATE_KEY!)),
      );
    }
    const txSignature = await sendNftTo(
      signerWallet as any,
      multisig,
      new PublicKey(nftMinted), // 10% NFT
      this.connection,
    );
    try {
      await safeUpdateTokenInDB({
        mint: token.mint,
        migration: token.migration,
        status: "locked",
        txId: txSignature,
        nftMinted,
      });

    } catch (err) {
      console.error(
        `[SendNft] Failed to POST migration/update for ${token.mint}:`,
        err
      );
    }

    logger.log(
      `[Send] Sending NFT to manager multisig for token ${token.mint} with NFT ${nftMinted}`,
    );
    return { txId: txSignature, extraData: { sentNftMint: nftMinted } };
  }
  // send the 90% to our raydium vault
  async depositNftToRaydiumVault(
    token: any,
    nftMinted: string,
    claimer_address: PublicKey,
  ): Promise<{ txId: string; extraData: object }> {
    console.log("Depositing NFT to Raydium vault", nftMinted);
    const signerWallet =
      this.wallet.payer ??
      Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.EXECUTOR_PRIVATE_KEY!)),
      );
    const txSignature = await depositToRaydiumVault(
      this.provider,
      signerWallet,
      this.program,
      new PublicKey(nftMinted), // 90% NFT
      claimer_address,
    );

    try {
      await safeUpdateTokenInDB({
        mint: token.mint,
        migration: token.migration,
        status: "locked",
        txId: txSignature,
        nftMinted,
      });

    } catch (err) {
      console.error(
        `[DepositNFT] Failed to POST migration/update for ${token.mint}:`,
        err
      );

      logger.error(
        `[DepositNFT] Failed to POST migration/update for ${token.mint}:`,
        err,
      );
    }

    logger.log(
      `[Deposit] Depositing NFT to Raydium vault for token ${token.mint} with NFT ${nftMinted}`,
    );
    return { txId: txSignature, extraData: { depositedNftMint: nftMinted } };
  }

  async finalizeMigration(token: any): Promise<{ txId: string; extraData: object }> {
    console.log("Finalizing migration for token", token.mint);
    try {
      token.status = "locked";
      token.lockedAt = new Date().toISOString();

      // await safePostUpdate
      //   (process.env,
      //     {
      //       mint: token.mint,
      //       migration: token.migration,
      //       status: "locked",
      //       lockedAt: token.lockedAt,
      //       step: "finalize",
      //     },
      //   )
      console.log(
        "Finalizing migration for token",
        token.mint,
        token.lockedAt,
      )

    } catch (err) {
      console.error(
        `[Finalize] Failed to POST migration/update for ${token.mint}:`,
        // err
      );
    }

    return {
      txId: token.lockedAt,
      extraData: {
        lockedAt: token.lockedAt,
        status: "locked",
      },
    };
  }

  async collectFee(token: any): Promise<{ txId: string; extraData: object }> {
    console.log("Collecting fee for token", token.mint);
    if (process.env.FIXED_FEE === undefined || Number(process.env.FIXED_FEE) === 0) {
      console.log("No fee to collect");
      return { txId: "no_fee", extraData: {} };
    }
    const mintConstantFee = new BN(Number(process.env.FIXED_FEE ?? 6) * 1e9); // 6 SOL
    const feeWallet = new PublicKey(process.env.FEE_WALLET!);
    const signerWallet =
      this.wallet.payer ??
      Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(process.env.EXECUTOR_PRIVATE_KEY!)),
      );
    const txSignature = await sendSolTo(
      mintConstantFee,
      signerWallet,
      feeWallet,
      this.connection,
    );


    return { txId: txSignature ?? "", extraData: { feeCollected: mintConstantFee.toString() } };
  }

  private async fetchPoolInfoWithRetry(
    raydium: any,
    poolId: string,
  ): Promise<{ poolInfo: any; poolKeys: any }> {
    const MAX_RETRIES = 10;
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
        await new Promise((res) => setTimeout(res, 5000)); // wait 5 seconds before retrying
      }
    }
    return { poolInfo, poolKeys };
  }
}
