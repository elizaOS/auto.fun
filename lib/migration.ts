import { Connection, PublicKey, ComputeBudgetProgram } from "@solana/web3.js"
import { Program, BN } from "@coral-xyz/anchor"
import { withdrawTx } from "./scripts"
import { execWithdrawTx, getAssociatedTokenAccount } from "./util"
import { Token, Fee } from "../schemas"
import { txVersion, initSdk } from "./raydium-config"
import {
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
} from "@raydium-io/raydium-sdk-v2"
import { logger } from "../logger"
import { NATIVE_MINT } from "@solana/spl-token"

interface WithdrawResult {
  withdrawTxId: string
  withdrawLogs: string[]
}

export class MigrationService {
  private connection: Connection
  private program: Program<any>
  private wallet: any
  private io: any

  constructor(
    connection: Connection,
    program: Program<any>,
    wallet: any,
    io: any
  ) {
    this.connection = connection
    this.program = program
    this.wallet = wallet
    this.io = io
  }

  public async migrateToken(token: any): Promise<void> {
    try {
      // 1. Withdraw funds with compute budget instructions
      const { withdrawTxId, withdrawLogs } = await this.withdrawFunds(token)

      // 2. Parse withdrawn amounts from logs
      const withdrawnAmounts = this.parseWithdrawLogs(withdrawLogs)

      // 3. Initialize Raydium SDK & prepare pool creation parameters
      const raydium = await initSdk({ loadToken: true })
      const { mintA, mintB, feeConfig } = await this.preparePoolCreation(
        token,
        raydium
      )

      // 4. Compute fee amounts & remaining amounts to be used for pool creation
      const { tokenFeeAmount, solFeeAmount, remainingTokens, remainingSol } =
        this.computeFees(withdrawnAmounts)

      // 5. Create pool using Raydium CPMM pool creation
      const { txId, poolAddresses } = await this.createPool(
        token,
        raydium,
        mintA,
        mintB,
        feeConfig,
        remainingTokens,
        remainingSol
      )

      // 6. Record fee details related to migration
      await this.recordFee(token, txId, tokenFeeAmount, solFeeAmount)

      // 7. Update token status to 'migrated' and store pool info
      const updatedToken = await this.updateTokenMigrated(token, poolAddresses)
      this.io.to(`token-${token.mint}`).emit("updateToken", updatedToken)

      // 8. Wait 20 minutes (1200000 ms) for pool confirmation
      // await this.delay(1200000)

      // 9. Fetch pool info with a retry loop to ensure the pool is confirmed
      const { poolInfo, poolKeys } = await this.fetchPoolInfoWithRetry(
        raydium,
        poolAddresses.id
      )

      // 10. Wait an additional 25 seconds before next step
      await this.delay(25000)

      // 11. Lock LP tokens (split into primary and secondary portions)
      await this.lockLpTokens(raydium, token, poolInfo, poolKeys)

      logger.log(`Migration completed for token ${token.mint}`)
    } catch (error) {
      logger.error(
        `Migration failed for token ${token.mint} in MigrationService:`,
        error
      )
      await Token.findOneAndUpdate(
        { mint: token.mint },
        { status: "migration_failed", lastUpdated: new Date() }
      )
    }
  }

  private async withdrawFunds(token: any): Promise<WithdrawResult> {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000,
    })
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 50000,
    })

    logger.log("Withdrawing funds for token:", token.mint)
    const transaction = await withdrawTx(
      this.wallet.publicKey,
      new PublicKey(token.mint),
      this.connection,
      this.program
    )

    // Prepend the compute budget instructions
    transaction.instructions = [
      modifyComputeUnits,
      addPriorityFee,
      ...transaction.instructions,
    ]

    const { signature: withdrawTxId, logs: withdrawLogs } =
      await execWithdrawTx(transaction, this.connection, this.wallet)

    logger.log("Withdrawal complete with txId:", withdrawTxId)
    return { withdrawTxId, withdrawLogs }
  }

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

    logger.log("Parsed withdrawn amounts:", { withdrawnSol, withdrawnTokens })
    return { withdrawnSol, withdrawnTokens }
  }

  private async preparePoolCreation(
    token: any,
    raydium: any
  ): Promise<{ mintA: any; mintB: any; feeConfig: any }> {
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
    logger.log("Fee configuration selected:", feeConfig)
    return { mintA, mintB, feeConfig }
  }

  private computeFees(withdrawnAmounts: {
    withdrawnSol: number
    withdrawnTokens: number
  }): {
    tokenFeeAmount: BN
    solFeeAmount: BN
    remainingTokens: BN
    remainingSol: BN
  } {
    const FEE_BASIS_POINTS = 10000
    const FEE_PERCENTAGE = Number(process.env.FEE_PERCENTAGE || "10")
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

    logger.log("Fee computation:", {
      tokenFeeAmount: tokenFeeAmount.toString(),
      solFeeAmount: solFeeAmount.toString(),
      remainingTokens: remainingTokens.toString(),
      remainingSol: remainingSol.toString(),
    })

    return { tokenFeeAmount, solFeeAmount, remainingTokens, remainingSol }
  }

  private async createPool(
    token: any,
    raydium: any,
    mintA: any,
    mintB: any,
    feeConfig: any,
    remainingTokens: BN,
    remainingSol: BN
  ): Promise<{ txId: string; poolAddresses: any }> {
    logger.log("Creating Raydium CPMM pool for token:", token.mint)

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
      mintAAmount: remainingTokens, // already a BN
      mintBAmount: remainingSol, // already a BN
      startTime: new BN(0),
      feeConfig,
      associatedOnly: true,
      ownerInfo: { useSOLBalance: true },
      txVersion,
    })

    const { txId } = await poolCreation.execute({ sendAndConfirm: true })
    logger.log("Pool created with txId:", txId)

    const poolAddresses = {
      id: poolCreation.extInfo.address.poolId.toString(),
      lpMint: poolCreation.extInfo.address.lpMint.toString(),
      baseVault: poolCreation.extInfo.address.vaultA.toString(),
      quoteVault: poolCreation.extInfo.address.vaultB.toString(),
    }

    logger.log("Pool addresses:", poolAddresses)
    return { txId, poolAddresses }
  }

  private async recordFee(
    token: any,
    txId: string,
    tokenFeeAmount: BN,
    solFeeAmount: BN
  ): Promise<void> {
    await Fee.findOneAndUpdate(
      { txId },
      {
        tokenMint: token.mint,
        tokenAmount: tokenFeeAmount.toString(),
        solAmount: solFeeAmount.toString(),
        type: "migration",
        txId,
        timestamp: new Date(),
      },
      { upsert: true, new: true }
    )
    logger.log("Fee record created for txId:", txId)
  }

  private async updateTokenMigrated(
    token: any,
    poolAddresses: any
  ): Promise<any> {
    const updatedToken = await Token.findOneAndUpdate(
      { mint: token.mint },
      {
        status: "migrated",
        migratedAt: new Date(),
        marketId: poolAddresses.id,
        baseVault: poolAddresses.baseVault,
        quoteVault: poolAddresses.quoteVault,
        lastUpdated: new Date(),
      },
      { new: true }
    )
    return updatedToken
  }

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
        logger.log(
          `Attempt ${retryCount + 1} to fetch pool info for poolId: ${poolId}`
        )
        if (raydium.cluster === "devnet") {
          const data = await raydium.cpmm.getPoolInfoFromRpc(poolId)
          poolInfo = data.poolInfo
          poolKeys = data.poolKeys
        } else {
          const data = await raydium.api.fetchPoolById({ ids: poolId })
          if (!data || data.length === 0) {
            logger.error("Pool info not found")
            throw new Error("Pool info not found")
          }
          poolInfo = data[0]
        }
      } catch (error) {
        retryCount++
        if (retryCount === MAX_RETRIES) {
          logger.error(
            `Failed to fetch pool info after ${MAX_RETRIES} attempts for poolId: ${poolId}`
          )
          throw error
        }
        logger.log(
          `Pool info not found, waiting 5 minutes before retry ${
            retryCount + 1
          }...`
        )
        await this.delay(300000) // 5 minutes delay
      }
    }
    logger.log("Pool info fetched successfully.")
    return { poolInfo, poolKeys }
  }

  private async lockLpTokens(
    raydium: any,
    token: any,
    poolInfo: any,
    poolKeys: any
  ): Promise<void> {
    logger.log("Locking LP tokens for token:", token.mint)
    await raydium.account.fetchWalletTokenAccounts()
    const lpMintStr = poolInfo.lpMint.address
    const lpAccount = raydium.account.tokenAccounts.find(
      (a: any) => a.mint.toBase58() === lpMintStr
    )
    if (!lpAccount) {
      throw new Error(`No LP balance found for pool: ${poolInfo.id}`)
    }
    logger.log("LP balance found:", lpAccount.amount.toString())

    const PRIMARY_LOCK_PERCENTAGE = Number(
      process.env.PRIMARY_LOCK_PERCENTAGE || "90"
    )
    const SECONDARY_LOCK_PERCENTAGE = Number(
      process.env.SECONDARY_LOCK_PERCENTAGE || "10"
    )
    if (PRIMARY_LOCK_PERCENTAGE + SECONDARY_LOCK_PERCENTAGE !== 100) {
      logger.error("Lock percentages must sum to 100%", {
        primary: PRIMARY_LOCK_PERCENTAGE,
        secondary: SECONDARY_LOCK_PERCENTAGE,
      })
    }
    const totalLPAmount = lpAccount.amount
    const primaryAmount = totalLPAmount.muln(PRIMARY_LOCK_PERCENTAGE).divn(100)
    const secondaryAmount = totalLPAmount
      .muln(SECONDARY_LOCK_PERCENTAGE)
      .divn(100)

    // Lock primary portion
    const { execute: lockExecutePrimary, extInfo: lockExtInfoPrimary } =
      await raydium.cpmm.lockLp({
        poolInfo,
        poolKeys,
        lpAmount: primaryAmount,
        withMetadata: true,
        txVersion,
        computeBudgetConfig: {
          units: 300000,
          microLamports: 50000,
        },
      })
    const { txId: lockTxIdPrimary } = await lockExecutePrimary({
      sendAndConfirm: true,
    })
    logger.log(
      `${PRIMARY_LOCK_PERCENTAGE}% LP tokens locked with txId:`,
      lockTxIdPrimary
    )
    logger.log(
      `NFT Minted for ${PRIMARY_LOCK_PERCENTAGE}% Lock:`,
      lockExtInfoPrimary.nftMint.toString()
    )

    // Lock secondary portion
    const { execute: lockExecuteSecondary, extInfo: lockExtInfoSecondary } =
      await raydium.cpmm.lockLp({
        poolInfo,
        poolKeys,
        lpAmount: secondaryAmount,
        withMetadata: true,
        txVersion,
        computeBudgetConfig: {
          units: 300000,
          microLamports: 50000,
        },
      })
    const { txId: lockTxIdSecondary } = await lockExecuteSecondary({
      sendAndConfirm: true,
    })
    logger.log(
      `${SECONDARY_LOCK_PERCENTAGE}% LP tokens locked with txId:`,
      lockTxIdSecondary
    )
    logger.log(
      `NFT Minted for ${SECONDARY_LOCK_PERCENTAGE}% Lock:`,
      lockExtInfoSecondary.nftMint.toString()
    )

    // Store the lock details in the token record and emit a socket update
    const lockedToken = await Token.findOneAndUpdate(
      { mint: token.mint },
      {
        lockId: `${lockTxIdPrimary},${lockTxIdSecondary}`,
        nftMinted: `${lockExtInfoPrimary.nftMint.toString()},${lockExtInfoSecondary.nftMint.toString()}`,
        lockedAmount: totalLPAmount.toString(),
        lockedAt: new Date(),
        status: "locked",
        lastUpdated: new Date(),
      },
      { new: true }
    )
    this.io.to(`token-${token.mint}`).emit("updateToken", lockedToken)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
