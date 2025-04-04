import { logger } from "../logger";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { updateTokenInDB } from "../cron";
import {
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
  DEV_LOCK_CPMM_AUTH,
  DEV_LOCK_CPMM_PROGRAM,
  mul,
} from "@raydium-io/raydium-sdk-v2";
import { Program, BN, AnchorProvider } from "@coral-xyz/anchor";
import { initSdk, txVersion } from "./raydium-config";
import { withdrawTx, execWithdrawTx } from "./withdraw";
import { NATIVE_MINT } from "@solana/spl-token";
import { Env } from "../env";
import { depositToRaydiumVault } from "./raydiumVault";
import { sendNftTo } from "./utils";
import { retryOperation } from "./utils";
import { RaydiumVault } from "./types/raydium_vault";
import { getWebSocketClient } from "../websocket-client";
import { Autofun } from "../target/types/autofun";

export class TokenMigrator {
  constructor(
    public env: Env,
    public connection: Connection,
    public wallet: Keypair,
    public program: Program<RaydiumVault>,
    public autofunProgram: Program<Autofun>,
    public provider: AnchorProvider
  ) {}
  FEE_PERCENTAGE = 10; // 10% fee for pool creation

  async migrateToken(token: any): Promise<void> {
    try {
      if (!token.migration) {
        token.migration = {};
      }
      const ws = getWebSocketClient(this.env);

      // Step 1: Withdraw funds
      if (
        !token.migration.withdraw ||
        token.migration.withdraw.status !== "success"
      ) {
        logger.log(`[Migrate] Starting withdrawal for token ${token.mint}`);
        const withdrawResult = await retryOperation(
          () => this.performWithdraw(token),
          3,
          2000
        );
        token.migration.withdraw = {
          status: "success",
          txId: withdrawResult.txId,
          updatedAt: new Date(),
        };
        token.withdrawnAmounts = withdrawResult.withdrawnAmounts;

        const tokenData = {
          mint: token.mint,
          status: "migrating",
          lastUpdated: new Date(),
        };
        await updateTokenInDB(this.env, tokenData);
        // emit the migration start event
        ws.to(`token-${token.mint}`).emit("migrationStarted", {
          mint: token.mint,
          status: "migrating",
        });

        logger.log(
          `[Migrate] Withdrawal successful for token ${token.mint} txId: ${withdrawResult.txId}`
        );
      } else {
        logger.log(
          `[Migrate] Withdrawal already processed for token ${token.mint}`
        );
      }

      // Step 2: Create pool
      if (
        !token.migration.createPool ||
        token.migration.createPool.status !== "success"
      ) {
        logger.log(`[Migrate] Starting pool creation for token ${token.mint}`);
        const poolResult = await retryOperation(
          () => this.performCreatePool(token),
          3,
          2000
        );
        token.migration.createPool = {
          status: "success",
          txId: poolResult.txId,
          updatedAt: new Date(),
        };
        token.marketId = poolResult.poolId;
        token.poolInfo = poolResult.poolAddresses;

        const tokenData = {
          mint: token.mint,
          status: "migrated",
          marketId: token.marketId,
          poolInfo: token.poolInfo,
          lastUpdated: new Date(),
        };
        await updateTokenInDB(this.env, tokenData);
        ws.to(`token-${token.mint}`).emit("poolCreated", {
          mint: token.mint,
          marketId: token.marketId,
          poolInfo: token.poolInfo,
          txId: poolResult.txId,
        });

        logger.log(
          `[Migrate] Pool creation successful for token ${token.mint} txId: ${poolResult.txId}`
        );
      } else {
        logger.log(
          `[Migrate] Pool creation already processed for token ${token.mint}`
        );
      }

      // Step 4: Lock LP tokens
      if (
        !token.migration.lockLP ||
        token.migration.lockLP.status !== "success"
      ) {
        logger.log(
          `[Migrate] Starting LP token locking for token ${token.mint}`
        );
        const lockResult = await retryOperation(
          () => this.performLockLP(token),
          3,
          2000
        );
        token.migration.lockLP = {
          status: "success",
          txId: lockResult.txId,
          updatedAt: new Date(),
        };
        token.lockLpTxId = lockResult.txId;
        token.nftMinted = lockResult.nftMinted;
        const tokenData = {
          mint: token.mint,
          lockId: lockResult.txId,
          nftMinted: lockResult.nftMinted,
          lockedAmount: token.lockedAmount,
          lockedAt: new Date(),
        };
        await updateTokenInDB(this.env, tokenData);
        ws.to(`token-${token.mint}`).emit("lpLocked", {
          mint: token.mint,
          lockId: lockResult.txId,
          nftMinted: lockResult.nftMinted,
          txId: lockResult.txId,
          marketId: token.marketId,
        });
        await logger.log(
          `[Migrate] LP token locking successful for token ${token.mint} txId: ${lockResult.txId}`
        );
      } else {
        logger.log(
          `[Migrate] LP token locking already processed for token ${token.mint}`
        );
      }

      //step 4 : send the 10 nft to  our raydium vault and the 10% to the manager multisig
      if (
        !token.migration.sendNft ||
        token.migration.sendNft.status !== "success"
      ) {
        const signerWallet = this.wallet;
        const multisig = new PublicKey(this.env.MANAGER_MULTISIG_ADDRESS!);
        logger.log(
          `[Migrate] Sending NFT to manager multisig for token ${token.mint}`
        );
        const sendNftResult = await retryOperation(
          () =>
            this.sendNftToManagerMultisig(
              token,
              token.nftMinted.split(",")[1], // 10% NFT
              signerWallet,
              multisig
            ),
          3,
          2000
        );
        token.migration.sendNft = {
          status: "success",
          txId: sendNftResult,
          updatedAt: new Date(),
        };
        logger.log(
          `[Migrate] NFT sent to manager multisig for token ${token.mint} txId: ${sendNftResult}`
        );
      } else {
        logger.log(
          `[Migrate] NFT already sent to manager multisig for token ${token.mint}`
        );
      }

      // 5 : deposit the 90% NFT to our raydium vault
      if (
        !token.migration.depositNft ||
        token.migration.depositNft.status !== "success"
      ) {
        logger.log(
          `[Migrate] Depositing NFT to Raydium vault for token ${token.mint}`
        );
        const depositNftResult = await retryOperation(
          () =>
            this.depositNftToRaydiumVault(
              token,
              token.nftMinted.split(",")[0], // 90% NFT
              new PublicKey(token.creator) // claimer address
            ),
          3,
          2000
        );
        token.migration.depositNft = {
          status: "success",
          txId: depositNftResult,
          updatedAt: new Date(),
        };
        // emit the nft deposit event
        ws.to(`token-${token.mint}`).emit("nftDeposited", {
          mint: token.mint,
          txId: depositNftResult,
        });
        logger.log(
          `[Migrate] NFT deposited to Raydium vault for token ${token.mint} txId: ${depositNftResult}`
        );
      } else {
        logger.log(
          `[Migrate] NFT already deposited to Raydium vault for token ${token.mint}`
        );
      }

      // Step 6: Finalize migration
      if (
        !token.migration.finalize ||
        token.migration.finalize.status !== "success"
      ) {
        logger.log(`[Migrate] Finalizing migration for token ${token.mint}`);
        const finalizeResult = await this.finalizeMigration(token);
        token.migration.finalize = {
          status: "success",
          txId: finalizeResult.txId,
          updatedAt: new Date(),
        };
        token.status = "locked";
        const tokenData = {
          mint: token.mint,
          status: "locked",
          lastUpdated: new Date(),
        };
        await updateTokenInDB(this.env, tokenData);

        // emit the migration completion event
        ws.to(`token-${token.mint}`).emit("migrationCompleted", {
          mint: token.mint,
          marketId: token.marketId,
          status: "locked",
        });
        logger.log(`[Migrate] Migration finalized for token ${token.mint}`);
      } else {
        logger.log(
          `[Migrate] Migration finalization already processed for token ${token.mint}`
        );
      }

      // emit and event for migration completion
    } catch (error) {
      logger.error(`[Migrate] Migration failed for token ${token.mint}:`);
      console.log(error + "");
      await updateTokenInDB(this.env, {
        mint: token.mint,
        status: "migration_failed",
        lastUpdated: new Date(),
      });
    }
  }

  async performWithdraw(token: any): Promise<{
    txId: string;
    withdrawnAmounts: { withdrawnSol: number; withdrawnTokens: number };
  }> {
    logger.log(`[Withdraw] Withdrawing funds for token ${token.mint}`);
    const transaction = await withdrawTx(
      this.wallet.publicKey,
      new PublicKey(token.mint),
      this.connection,
      this.autofunProgram
    );

    transaction.instructions = [...transaction.instructions];

    const { signature: txId, logs } = await execWithdrawTx(
      transaction,
      this.connection,
      this.wallet
    );
    const withdrawnAmounts = this.parseWithdrawLogs(logs);
    return { txId, withdrawnAmounts };
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
          log.replace("Program log: withdraw lamports:", "").trim()
        );
      }
      if (log.includes("withdraw token:")) {
        withdrawnTokens = Number(
          log.replace("Program log: withdraw token:", "").trim()
        );
      }
    });
    return { withdrawnSol, withdrawnTokens };
  }

  async performCreatePool(
    token: any
  ): Promise<{ txId: string; poolId: string; poolAddresses: any }> {
    const raydium = await initSdk({ env: this.env, loadToken: false });
    const mintA = await raydium.token.getTokenInfo(token.mint);
    const mintB = await raydium.token.getTokenInfo(NATIVE_MINT);

    const feeConfigs = await raydium.api.getCpmmConfigs();
    if (raydium.cluster === "devnet") {
      feeConfigs.forEach((config: any) => {
        config.id = getCpmmPdaAmmConfigId(
          DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
          config.index
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

    return { txId, poolId: poolAddresses.id, poolAddresses };
  }

  async performLockLP(
    token: any
  ): Promise<{ txId: string; nftMinted: string }> {
    const raydium = await initSdk({ env: this.env, loadToken: false });
    const poolId = token.marketId;
    const poolInfoResult = await this.fetchPoolInfoWithRetry(raydium, poolId);
    const poolInfo = poolInfoResult.poolInfo;
    const poolKeys = poolInfoResult.poolKeys;

    await raydium.account.fetchWalletTokenAccounts();
    const lpMintStr = poolInfo.lpMint.address;
    const lpAccount = raydium.account.tokenAccounts.find(
      (a: any) => a.mint.toBase58() === lpMintStr
    );
    if (!lpAccount) {
      throw new Error(`No LP balance found for pool: ${poolInfo.id}`);
    }

    const PRIMARY_LOCK_PERCENTAGE = Number(
      process.env.PRIMARY_LOCK_PERCENTAGE || "90"
    );
    const SECONDARY_LOCK_PERCENTAGE = Number(
      process.env.SECONDARY_LOCK_PERCENTAGE || "10"
    );
    if (PRIMARY_LOCK_PERCENTAGE + SECONDARY_LOCK_PERCENTAGE !== 100) {
      throw new Error("Lock percentages must sum to 100");
    }
    const totalLPAmount = lpAccount.amount;
    const primaryAmount = totalLPAmount.muln(PRIMARY_LOCK_PERCENTAGE).divn(100);
    const secondaryAmount = totalLPAmount
      .muln(SECONDARY_LOCK_PERCENTAGE)
      .divn(100);

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
        programId: DEV_LOCK_CPMM_PROGRAM,
        authProgram: DEV_LOCK_CPMM_AUTH,
      });
    const { txId: lockTxIdPrimary } = await lockExecutePrimary({
      sendAndConfirm: true,
    });
    logger.log(`[Lock] Primary LP lock txId: ${lockTxIdPrimary}`);

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
        programId: DEV_LOCK_CPMM_PROGRAM,
        authProgram: DEV_LOCK_CPMM_AUTH,
      });
    const { txId: lockTxIdSecondary } = await lockExecuteSecondary({
      sendAndConfirm: true,
    });
    logger.log(`[Lock] Secondary LP lock txId: ${lockTxIdSecondary}`);

    const aggregatedTxId = `${lockTxIdPrimary},${lockTxIdSecondary}`;
    const aggregatedNftMint = `${lockExtInfoPrimary.nftMint.toString()},${lockExtInfoSecondary.nftMint.toString()}`;

    const tokenData = {
      mint: token.mint,
      lockId: aggregatedTxId,
      nftMinted: aggregatedNftMint,
      lockedAmount: totalLPAmount.toString(),
      status: "locked",
      lastUpdated: new Date(),
      lockedAt: new Date(),
    };
    await updateTokenInDB(this.env, tokenData);

    return { txId: aggregatedTxId, nftMinted: aggregatedNftMint };
  }

  // send the 10% to the manager multisig
  async sendNftToManagerMultisig(
    token: any,
    nftMinted: string,
    signerWallet: Keypair,
    multisig: PublicKey
  ): Promise<string> {
    const txSignature = await sendNftTo(
      signerWallet,
      multisig,
      new PublicKey(nftMinted), // 10% NFT
      this.connection
    );

    logger.log(
      `[Send] Sending NFT to manager multisig for token ${token.mint} with NFT ${nftMinted}`
    );
    return txSignature;
  }
  // send the 90% to our raydium vault
  async depositNftToRaydiumVault(
    token: any,
    nftMinted: string,
    claimer_address: PublicKey
  ): Promise<string> {
    const txSignature = await depositToRaydiumVault(
      this.provider,
      this.wallet,
      this.program,
      new PublicKey(nftMinted), // 90% NFT
      claimer_address
    );

    logger.log(
      `[Deposit] Depositing NFT to Raydium vault for token ${token.mint} with NFT ${nftMinted}`
    );
    return txSignature;
  }

  async finalizeMigration(token: any): Promise<{ txId: string }> {
    return { txId: "finalized" };
  }
  private async fetchPoolInfoWithRetry(
    raydium: any,
    poolId: string
  ): Promise<{ poolInfo: any; poolKeys: any }> {
    const MAX_RETRIES = 12;
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
        await new Promise((res) => setTimeout(res, 300000)); // wait 5 minutes
      }
    }
    return { poolInfo, poolKeys };
  }
}
