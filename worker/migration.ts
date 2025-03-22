import { BN, Program } from "@coral-xyz/anchor"
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet"
import {
  CREATE_CPMM_POOL_FEE_ACC,
  CREATE_CPMM_POOL_PROGRAM,
  DEV_LOCK_CPMM_AUTH,
  DEV_LOCK_CPMM_PROGRAM,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
} from "@raydium-io/raydium-sdk-v2"
import { NATIVE_MINT } from "@solana/spl-token"
import { Connection, PublicKey } from "@solana/web3.js"
import { eq } from "drizzle-orm"
import { Server } from "socket.io"
import { getDB, tokens } from "./db"
import { Env } from "./env"
import { logger } from "./logger"
import { initSdk, txVersion } from "./raydium"
import { execWithdrawTx, withdrawTx } from "./util"
import { getWebSocketClient } from './websocket-client'

/**
 * Creates a migration service that works with the new Env type
 * by adapting it to the interface expected by MigrationService
 */
export function createMigrationService(
  connection: Connection,
  programId: PublicKey,
  wallet: NodeWallet,
  env: Env
): MigrationService {
  // Create a mock Program object with just enough functionality to work with MigrationService
  const mockProgram = {
    programId,
    provider: { connection, wallet },
    // Add any other properties used by MigrationService
  };

  // Create a simple adapter that has the necessary methods that MigrationService expects
  const wsClient = getWebSocketClient(env);

  // This adapter implements enough of the socket.io interface to work with MigrationService
  const socketAdapter = {
    to: (room: string) => ({
      emit: (event: string, data: any) => wsClient.emit(room, event, data)
    }),
    // Add any other required socket.io methods here
  };

  return new MigrationService(connection, mockProgram as Program<any>, wallet, env, socketAdapter as any);
} 
// Helper to retry asynchronous operations
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  delay: number
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === maxRetries - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error("Unreachable")
}

// Add a helper function at the top of the file, after imports
function storeMigrationMetadata(token: any, _stateJson: string, db: any) {
  return db.update(tokens)
    .set({ 
      status: token.status || 'migrating',
      lastUpdated: new Date().toISOString()
      // Store migration state info in a database field, or in a separate table
      // For now, we'll just rely on status field
    })
    .where(eq(tokens.mint, token.mint));
}

export class MigrationService {
  private connection: Connection
  private program: Program<any>
  private wallet: NodeWallet
  private io?: Server
  private env: Env

  constructor(
    connection: Connection,
    program: Program<any>,
    wallet: NodeWallet,
    env: Env,
    io?: Server
  ) {
    this.connection = connection
    this.program = program
    this.wallet = wallet
    this.env = env
    this.io = io
  }

  // Main migration flow; each step is idempotent and state is persisted.
  async migrateToken(token: any): Promise<void> {
    try {
      const db = getDB(this.env);
      
      if (!token.migration) {
        token.migration = {}
      }

      // Step 1: Withdraw funds
      if (
        !token.migration.withdraw ||
        token.migration.withdraw.status !== "success"
      ) {
        logger.log(`[Migrate] Starting withdrawal for token ${token.mint}`)
        const withdrawResult = await retryOperation(
          () => this.performWithdraw(token),
          3,
          2000
        )
        token.migration.withdraw = {
          status: "success",
          txId: withdrawResult.txId,
          updatedAt: new Date().toISOString(),
        }
        token.withdrawnAmounts = withdrawResult.withdrawnAmounts
        
        await storeMigrationMetadata(token, JSON.stringify(token.migration), db)
        
        logger.log(
          `[Migrate] Withdrawal successful for token ${token.mint} txId: ${withdrawResult.txId}`
        )
      } else {
        logger.log(
          `[Migrate] Withdrawal already processed for token ${token.mint}`
        )
      }

      // Step 2: Create pool
      if (
        !token.migration.createPool ||
        token.migration.createPool.status !== "success"
      ) {
        logger.log(`[Migrate] Starting pool creation for token ${token.mint}`)
        const poolResult = await retryOperation(
          () => this.performCreatePool(token),
          3,
          2000
        )
        token.migration.createPool = {
          status: "success",
          txId: poolResult.txId,
          updatedAt: new Date().toISOString(),
        }
        token.marketId = poolResult.poolId
        token.poolInfo = poolResult.poolAddresses
        
        await storeMigrationMetadata(token, JSON.stringify(token.migration), db)
        
        logger.log(
          `[Migrate] Pool creation successful for token ${token.mint} txId: ${poolResult.txId}`
        )
      } else {
        logger.log(
          `[Migrate] Pool creation already processed for token ${token.mint}`
        )
      }

      // Step 3: Lock LP tokens
      if (
        !token.migration.lockLP ||
        token.migration.lockLP.status !== "success"
      ) {
        logger.log(
          `[Migrate] Starting LP token locking for token ${token.mint}`
        )
        const lockResult = await retryOperation(
          () => this.performLockLP(token),
          3,
          2000
        )
        token.migration.lockLP = {
          status: "success",
          txId: lockResult.txId,
          updatedAt: new Date().toISOString(),
        }
        token.lockLpTxId = lockResult.txId
        token.nftMinted = lockResult.nftMinted
        
        await storeMigrationMetadata(token, JSON.stringify(token.migration), db)
        
        logger.log(
          `[Migrate] LP token locking successful for token ${token.mint} txId: ${lockResult.txId}`
        )
      } else {
        logger.log(
          `[Migrate] LP token locking already processed for token ${token.mint}`
        )
      }

      // Step 4: Finalize migration
      if (
        !token.migration.finalize ||
        token.migration.finalize.status !== "success"
      ) {
        logger.log(`[Migrate] Finalizing migration for token ${token.mint}`)
        const finalizeResult = await retryOperation(
          () => this.performFinalizeMigration(token),
          3,
          2000
        )
        token.migration.finalize = {
          status: "success",
          txId: finalizeResult.txId,
          updatedAt: new Date().toISOString(),
        }
        token.status = "locked"
        
        await storeMigrationMetadata(token, JSON.stringify(token.migration), db)
        
        logger.log(`[Migrate] Migration finalized for token ${token.mint}`)
      } else {
        logger.log(
          `[Migrate] Migration finalization already processed for token ${token.mint}`
        )
      }

      if (this.io) {
        this.io.to(`token-${token.mint}`).emit("updateToken", token)
      }
    } catch (error) {
      logger.error(`[Migrate] Migration failed for token ${token.mint}:`)
      console.log(error + "")
      
      const db = getDB(this.env);
      await db.update(tokens)
        .set({ 
          status: "migration_failed", 
          lastUpdated: new Date().toISOString() 
        })
        .where(eq(tokens.mint, token.mint));
    }
  }
  
  // Parse withdrawal logs to extract withdrawn amounts.
  private parseWithdrawLogs(withdrawLogs: string[]): {
    withdrawnSol: number
    withdrawnTokens: number
  } {
    let withdrawnSol = 0
    let withdrawnTokens = 0
    withdrawLogs.forEach((log) => {
      if (log.includes("withdraw lamports:")) {
        withdrawnSol = Number(
          log.replace("Program log: withdraw lamports:", "").trim()
        )
      }
      if (log.includes("withdraw token:")) {
        withdrawnTokens = Number(
          log.replace("Program log: withdraw token:", "").trim()
        )
      }
    })
    return { withdrawnSol, withdrawnTokens }
  }

  // Performs the withdrawal transaction.
  private async performWithdraw(token: any): Promise<{
    txId: string
    withdrawnAmounts: { withdrawnSol: number; withdrawnTokens: number }
  }> {
    logger.log(`[Withdraw] Withdrawing funds for token ${token.mint}`)
    const transaction = await withdrawTx(
      this.wallet.publicKey,
      new PublicKey(token.mint),
      this.connection,
      this.program
    )

    // Optionally add compute budget instructions here.
    transaction.instructions = [...transaction.instructions]

    const { signature: txId, logs } = await execWithdrawTx(
      transaction,
      this.connection,
      this.wallet
    )
    const withdrawnAmounts = this.parseWithdrawLogs(logs)
    return { txId, withdrawnAmounts }
  }

  // Creates the CPMM pool using Raydium's SDK.
  private async performCreatePool(
    token: any
  ): Promise<{ txId: string; poolId: string; poolAddresses: any }> {
    const raydium = await initSdk({ loadToken: false, env: this.env })
    const mintA = await raydium.token.getTokenInfo(token.mint)
    const mintB = await raydium.token.getTokenInfo(NATIVE_MINT)

    let feeConfigs = await raydium.api.getCpmmConfigs()
    if (raydium.cluster === "devnet") {
      feeConfigs.forEach((config: any) => {
        config.id = getCpmmPdaAmmConfigId(
          DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
          config.index
        ).publicKey.toBase58()
      })
    }
    const feeConfig =
      raydium.cluster === "devnet" ? feeConfigs[0] : feeConfigs[1]

    const withdrawnAmounts = token.withdrawnAmounts
    if (!withdrawnAmounts)
      throw new Error("No withdrawn amounts found for pool creation")

    const FEE_BASIS_POINTS = 10000
    // Get FEE_PERCENTAGE from env if available
    const FEE_PERCENTAGE = this.env?.FEE_PERCENTAGE ? 
      Number(this.env.FEE_PERCENTAGE) : 10;
      
    const feePercentageBN = new BN(FEE_PERCENTAGE)
    const feeBasisPointsBN = new BN(FEE_BASIS_POINTS)
    const withdrawnTokensBN = new BN(withdrawnAmounts.withdrawnTokens)
    const withdrawnSolBN = new BN(withdrawnAmounts.withdrawnSol)

    const tokenFeeAmount = withdrawnTokensBN
      .mul(feePercentageBN)
      .div(feeBasisPointsBN)
    const solFeeAmount = withdrawnSolBN
      .mul(feePercentageBN)
      .div(feeBasisPointsBN)
    const remainingTokens = withdrawnTokensBN.sub(tokenFeeAmount)
    const remainingSol = withdrawnSolBN.sub(solFeeAmount)

    logger.log(`[Pool] Creating pool for token ${token.mint}`)
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
    })

    const { txId } = await poolCreation.execute({ sendAndConfirm: true })
    const poolAddresses = {
      id: poolCreation.extInfo.address.poolId.toString(),
      lpMint: poolCreation.extInfo.address.lpMint.toString(),
      baseVault: poolCreation.extInfo.address.vaultA.toString(),
      quoteVault: poolCreation.extInfo.address.vaultB.toString(),
    }

    return { txId, poolId: poolAddresses.id, poolAddresses }
  }

  // Locks LP tokens using Raydium's SDK.
  private async performLockLP(
    token: any
  ): Promise<{ txId: string; nftMinted: string }> {
    const raydium = await initSdk({ loadToken: false, env: this.env })
    const poolId = token.marketId
    const poolInfoResult = await this.fetchPoolInfoWithRetry(raydium, poolId)
    const poolInfo = poolInfoResult.poolInfo
    const poolKeys = poolInfoResult.poolKeys

    await raydium.account.fetchWalletTokenAccounts()
    const lpMintStr = poolInfo.lpMint.address
    const lpAccount = raydium.account.tokenAccounts.find(
      (a: any) => a.mint.toBase58() === lpMintStr
    )
    if (!lpAccount) {
      throw new Error(`No LP balance found for pool: ${poolInfo.id}`)
    }

    // Get lock percentages from env or use defaults
    const PRIMARY_LOCK_PERCENTAGE = this.env?.PRIMARY_LOCK_PERCENTAGE ? 
      Number(this.env.PRIMARY_LOCK_PERCENTAGE) : 90;
      
    const SECONDARY_LOCK_PERCENTAGE = this.env?.SECONDARY_LOCK_PERCENTAGE ? 
      Number(this.env.SECONDARY_LOCK_PERCENTAGE) : 10;
      
    if (PRIMARY_LOCK_PERCENTAGE + SECONDARY_LOCK_PERCENTAGE !== 100) {
      throw new Error("Lock percentages must sum to 100")
    }
    const totalLPAmount = lpAccount.amount
    const primaryAmount = totalLPAmount.muln(PRIMARY_LOCK_PERCENTAGE).divn(100)
    const secondaryAmount = totalLPAmount
      .muln(SECONDARY_LOCK_PERCENTAGE)
      .divn(100)

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
      })
    const { txId: lockTxIdPrimary } = await lockExecutePrimary({
      sendAndConfirm: true,
    })
    logger.log(`[Lock] Primary LP lock txId: ${lockTxIdPrimary}`)

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
      })
    const { txId: lockTxIdSecondary } = await lockExecuteSecondary({
      sendAndConfirm: true,
    })
    logger.log(`[Lock] Secondary LP lock txId: ${lockTxIdSecondary}`)

    const aggregatedTxId = `${lockTxIdPrimary},${lockTxIdSecondary}`
    const aggregatedNftMint = `${lockExtInfoPrimary.nftMint.toString()},${lockExtInfoSecondary.nftMint.toString()}`

    const db = getDB(this.env);
    await db.update(tokens)
      .set({
        lockId: aggregatedTxId,
        nftMinted: aggregatedNftMint,
        lockedAmount: totalLPAmount.toString(),
        lockedAt: new Date().toISOString(),
        status: 'locking_lp',
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, token.mint));

    return { txId: aggregatedTxId, nftMinted: aggregatedNftMint }
  }

  // Fetch pool info with retry logic.
  private async fetchPoolInfoWithRetry(
    raydium: any,
    poolId: string
  ): Promise<{ poolInfo: any; poolKeys: any }> {
    const MAX_RETRIES = 12
    let retryCount = 0
    let poolInfo: any = null
    let poolKeys: any
    while (!poolInfo && retryCount < MAX_RETRIES) {
      try {
        if (raydium.cluster === "devnet") {
          const data = await raydium.cpmm.getPoolInfoFromRpc(poolId)
          poolInfo = data.poolInfo
          poolKeys = data.poolKeys
        } else {
          const data = await raydium.api.fetchPoolById({ ids: poolId })
          if (!data || data.length === 0) {
            throw new Error("Pool info not found")
          }
          poolInfo = data[0]
        }
      } catch (error) {
        retryCount++
        // If raydium instance failed, try to get a new one
        if (typeof error === 'object' && error !== null && 'message' in error &&
            typeof error.message === 'string' && error.message.includes("connection") && 
            retryCount < MAX_RETRIES - 1) {
          logger.log(`Refreshing Raydium SDK connection, attempt ${retryCount}`);
          raydium = await initSdk({ loadToken: false, env: this.env });
        }
        if (retryCount === MAX_RETRIES) {
          throw error
        }
        await new Promise((res) => setTimeout(res, 300000)) // wait 5 minutes
      }
    }
    return { poolInfo, poolKeys }
  }

  // Finalize migration (placeholder for additional on-chain steps if needed).
  private async performFinalizeMigration(
    _token: any
  ): Promise<{ txId: string }> {
    return { txId: "finalized" }
  }
}

// For testing, or migrating a token manually
// ;(async () => {
//   const { connection, program, w∏allet } = await initializeConfig()
//   try {
//     await connectDB()
//   } catch (error) {
//     logger.error("Failed to connect to MongoDB:", error)
//   }

//   const migrationService = new MigrationService(connection, program, wallet)
//   const token = await Token.findOne({
//     mint: "vwQVdGDodnS8UyeL9nhWNCRctqPSJa6LChqkKfc4Zy8",
//   })
//   await migrationService.migrateToken(token)
// })()
