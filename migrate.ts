import dotenv from "dotenv"
dotenv.config()
import {
  ComputeBudgetProgram,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js"
import { withdrawTx } from "./lib/scripts"
import { logger } from "./logger"
import {
  connectDB,
  execWithdrawTx,
  getAssociatedTokenAccount,
  initializeConfig,
} from "./lib/util"
import { Fee, Token } from "./schemas"
import { initSdk, txVersion } from "./lib/raydium-config"
import { NATIVE_MINT } from "@solana/spl-token"
import {
  ApiV3PoolInfoStandardItemCpmm,
  CpmmKeys,
  CREATE_CPMM_POOL_FEE_ACC,
  CREATE_CPMM_POOL_PROGRAM,
  DEV_LOCK_CPMM_AUTH,
  DEV_LOCK_CPMM_PROGRAM,
  DEVNET_PROGRAM_ID,
  getCpmmPdaAmmConfigId,
} from "@raydium-io/raydium-sdk-v2"
import BN from "bn.js"

async function handleMigration(token: any) {
  const { connection, program, wallet } = await initializeConfig()
  try {
    await connectDB()
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error)
  }

  let retryCount = 0
  try {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 300000, // Higher units for complex operation
    })

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 50000, // Higher priority fee for mainnet
    })

    // 1. Withdraw funds
    logger.log("Withdrawing funds...")
    const withdrawTransaction = await withdrawTx(
      wallet.publicKey,
      new PublicKey(token.mint),
      connection,
      program
    )

    // Add compute budget instructions
    withdrawTransaction.instructions = [
      modifyComputeUnits,
      addPriorityFee,
      ...withdrawTransaction.instructions,
    ]

    // const withdrawTxId = await execWithdrawTx(withdrawTransaction, connection, wallet);
    const { signature: withdrawTxId, logs: withdrawTxLogs } =
      await execWithdrawTx(withdrawTransaction, connection, wallet)

    // Get withdrawn amount
    const adminTokenATA = getAssociatedTokenAccount(
      wallet.publicKey,
      new PublicKey(token.mint)
    )
    const tokenBalance = await connection.getTokenAccountBalance(adminTokenATA)

    const withdrawnToken = await Token.findOneAndUpdate(
      { mint: token.mint },
      {
        status: "withdrawn",
        withdrawnAmount: 1000000000,
        withdrawnAt: new Date(),
        lastUpdated: new Date(),
      },
      { new: true }
    )

    // // // emit the updated token
    // // // io.to(`token-${token.mint}`).emit('updateToken', withdrawnToken);

    // // // Initialize Raydium SDK
    const raydium = await initSdk({ loadToken: false })
    // // console.log(raydium)

    // // Get token mint info
    // // TokenA
    const mintA = await raydium.token.getTokenInfo(token.mint)
    // // TokenB
    const mintB = await raydium.token.getTokenInfo(NATIVE_MINT)

    // // Get fee configs from Raydium
    const feeConfigs = await raydium.api.getCpmmConfigs()

    // // For devnet, update fee config IDs
    if (raydium.cluster === "devnet") {
      feeConfigs.forEach((config) => {
        config.id = getCpmmPdaAmmConfigId(
          DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
          config.index
        ).publicKey.toBase58()
      })
    }

    // logger.log("feeConfigs", feeConfigs)

    let feeConfig
    if (raydium.cluster === "devnet") {
      feeConfig = feeConfigs[0] // 0.25% fee ONLY on devnet?
    } else {
      feeConfig = feeConfigs[1] // 1% fee on mainnet
    }

    // logger.log("feeConfig selected", feeConfig)

    const FEE_PERCENTAGE = Number(process.env.FEE_PERCENTAGE || "1") // 0.1% for migration to raydium of both token and SOL

    // // logger.log("Token Amount Total", tokenBalance.value.amount);
    // // logger.log("Reserve Amount Total", token.reserveAmount);

    // // logger.log("withdrawTxLogs", withdrawTxLogs)

    // // Parse the withdrawn amounts from logs
    let withdrawnSol = 1
    let withdrawnTokens = 999000000000000

    withdrawTxLogs.forEach((log) => {
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

    logger.log("Withdrawn amounts from program:", {
      sol: withdrawnSol,
      tokens: withdrawnTokens,
    })

    // // Calculate fees using the exact withdrawn amounts
    const tokenFeeAmount = new BN(withdrawnTokens)
      .muln(FEE_PERCENTAGE)
      .divn(1000)
      .toString()

    const solFeeAmount = new BN(withdrawnSol)
      .muln(FEE_PERCENTAGE)
      .divn(1000)
      .toString()

    // // Use remaining amounts for pool creation
    const remainingTokens = new BN(withdrawnTokens).sub(new BN(tokenFeeAmount))
    const remainingSol = new BN(withdrawnSol).sub(new BN(solFeeAmount))

    // logger.log("Pool creation amounts:", {
    //   remainingTokens: remainingTokens.toString(),
    //   remainingSol: remainingSol.toString(),
    // })

    // Create pool using CPMM
    logger.log("Creating Raydium CPMM pool...")

    // wait 15 seconds
    // await new Promise(resolve => setTimeout(resolve, 15000));
    // Create pool instruction
    let poolCreation: any,
      txId: string,
      existingPool: any,
      poolId: string = "BEPW1qvawh3JcwybDmjDQPut1XCcYn7Tev79ci3YXu84"
    try {
      poolCreation = await raydium.cpmm.createPool({
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
        mintAAmount: new BN(remainingTokens),
        mintBAmount: new BN(remainingSol),
        startTime: new BN(0),
        feeConfig: feeConfig,
        associatedOnly: true,
        ownerInfo: {
          useSOLBalance: true,
        },
        txVersion: txVersion,
        computeBudgetConfig: {
          units: 400000,
          microLamports: 50000,
        },
      })

      // // Check if pool already exists
      poolId = poolCreation.extInfo.address.poolId.toString()
      try {
        existingPool = await raydium.cpmm.getPoolInfoFromRpc(poolId)
        if (existingPool) {
          logger.error(`Pool already exists at address: ${poolId}`)
          throw new Error("Pool already exists")
        }
      } catch (error) {
        if (error.message === "Pool already exists") {
          throw error
        }
        // If error is "account not found", continue with pool creation
      }

      // Execute pool creation
      const { txId: txid } = await poolCreation.execute({
        sendAndConfirm: true,
      })
      txId = txid
      logger.log(
        "Raydium Pool created for token:",
        token.mint,
        "with txId:",
        txId
      )
    } catch (e) {
      console.log(e)
    }

    // Store pool creation info for later use
    const { extInfo } = poolCreation

    // Store pool addresses
    logger.log("pool created", {
      txId,
      poolKeys: Object.keys(extInfo.address).reduce(
        (acc, cur) => ({
          ...acc,
          [cur]:
            extInfo.address[cur as keyof typeof extInfo.address].toString(),
        }),
        {}
      ),
    })

    // Store pool addresses
    const poolAddresses = {
      id: extInfo.address.poolId.toString(),
      lpMint: extInfo.address.lpMint.toString(),
      baseVault: extInfo.address.vaultA.toString(),
      quoteVault: extInfo.address.vaultB.toString(),
    }

    // Record fees
    const fee = await Fee.findOneAndUpdate(
      { txId: txId },
      {
        tokenMint: token.mint,
        tokenAmount: tokenFeeAmount,
        solAmount: solFeeAmount,
        type: "migration",
        txId: txId,
        timestamp: new Date(),
      },
      {
        upsert: true,
        new: true,
      }
    )

    // 4. Update final status and save market info
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
      {
        new: true,
      }
    )

    // // io.to(`token-${token.mint}`).emit("updateToken", updatedToken)

    // // wait 1200 seconds (20 minutes after pool creation to ensure its a fully confirmed pool)
    // await new Promise((resolve) => setTimeout(resolve, 1200000))

    // Get pool info for liquidity addition
    let poolInfo: ApiV3PoolInfoStandardItemCpmm
    let poolKeys: CpmmKeys | undefined

    // const poolId = extInfo.address.poolId.toString();
    logger.log("Fetching pool info for poolId:", poolId)

    // Retry mechanism for getting pool info over course of one hour every 5 minutes?
    const MAX_RETRIES = 12 // Try for up to 1 hour (12 * 5 minutes)
    let retryCount = 0
    let poolFound = false

    while (!poolFound && retryCount < MAX_RETRIES) {
      try {
        logger.log(
          `Attempt ${
            retryCount + 1
          }/${MAX_RETRIES} to fetch pool info for poolId: ${poolId}`
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
          poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm
        }

        // If we get here, pool was found
        poolFound = true
        logger.log("Pool info found successfully!")
      } catch (error) {
        retryCount++
        if (retryCount === MAX_RETRIES) {
          logger.error(
            `Failed to fetch pool to lock liquidity after ${MAX_RETRIES} attempts: ${error.message} - Pool ID: ${poolId}`
          )
          throw new Error(
            `Failed to fetch pool to lock liquidity after ${MAX_RETRIES} attempts: ${error.message} - Pool ID: ${poolId}`
          )
        }
        logger.log(
          `Pool not found yet, waiting 5 minutes before retry ${
            retryCount + 1
          }...`
        )
        // await new Promise((resolve) => setTimeout(resolve, 300000)) // 5 minutes
      }
    }

    // if (!poolInfo) {
    //   logger.error('Failed to get pool info after retries');
    // }

    // wait another 25 seconds
    await new Promise((resolve) => setTimeout(resolve, 5000))

    logger.log("Locking LP Tokens for Raydium LP 🔒...")

    // Fetch wallet token accounts to get LP balance
    await raydium.account.fetchWalletTokenAccounts()
    const lpBalance = raydium.account.tokenAccounts.find(
      (a) => a.mint.toBase58() === poolInfo.lpMint.address
    )

    if (!lpBalance) {
      throw new Error(`No LP balance found for pool: ${poolId}`)
    }

    logger.log("Found LP balance:", lpBalance.amount.toString())

    // devnet fix? needs testing still
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
      poolInfo = data[0] as ApiV3PoolInfoStandardItemCpmm
    }

    // Get split percentages from env vars with defaults
    const PRIMARY_LOCK_PERCENTAGE = Number(
      process.env.PRIMARY_LOCK_PERCENTAGE || "90"
    )
    const SECONDARY_LOCK_PERCENTAGE = Number(
      process.env.SECONDARY_LOCK_PERCENTAGE || "10"
    )

    // Validate percentages = 100%
    if (PRIMARY_LOCK_PERCENTAGE + SECONDARY_LOCK_PERCENTAGE !== 100) {
      logger.error("Lock percentages must sum to 100%", {
        primary: PRIMARY_LOCK_PERCENTAGE,
        secondary: SECONDARY_LOCK_PERCENTAGE,
      })
    }

    const totalLPAmount = lpBalance.amount
    const primaryAmount = totalLPAmount.muln(PRIMARY_LOCK_PERCENTAGE).divn(100)
    const secondaryAmount = totalLPAmount
      .muln(SECONDARY_LOCK_PERCENTAGE)
      .divn(100)

    logger.log("LP Token Split:", {
      total: totalLPAmount.toString(),
      primaryAmount: primaryAmount.toString(),
      secondaryAmount: secondaryAmount.toString(),
      primaryPercentage: PRIMARY_LOCK_PERCENTAGE,
      secondaryPercentage: SECONDARY_LOCK_PERCENTAGE,
    })

    // First lock - Primary percentage
    console.time("Locking LP Tokens - building tx")
    let lockExecutePrimary: any
    let lockExtInfoPrimary: any
    try {
      const { execute, extInfo, transaction, builder } =
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
      lockExecutePrimary = execute
      lockExtInfoPrimary = extInfo

      // send tx manually to debug errors
      // const { signedTx, txId } = await builder.build().execute()
      // // const txId = await connection.sendTransaction(transaction)
      // console.log("txId lock", txId)
    } catch (error) {
      console.log(error)
      throw error
    }
    console.timeEnd("Locking LP Tokens - building tx")

    console.time("Locking LP Tokens - sending tx")
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
    console.timeEnd("Locking LP Tokens - sending tx")

    console.time("Locking LP Tokens - building tx 2")
    // Second lock - Secondary percentage
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
    console.timeEnd("Locking LP Tokens - building tx 2")

    console.time("Locking LP Tokens - sending tx 2")
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
    console.timeEnd("Locking LP Tokens - sending tx 2")
    // Store both lock infos in token record
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

    logger.log(
      `Migration completed for token ${token.mint} on Raydium CP-Swap LP: ${poolId}`
    )
    // io.to(`token-${token.mint}`).emit("updateToken", lockedToken)
  } catch (error) {
    // logger.error(`Migration failed for token ${token.mint}:`, error);
    // retryCount++;
    // // Check retry count and retry if under max attempts
    // if (retryCount < 4) { // 0-4 = 5 attempts total
    //   logger.log(`Retrying migration attempt ${retryCount + 1} of 5 for token ${token.mint}...`);
    //   await new Promise(resolve => setTimeout(resolve, 35000));
    //   return this.handleMigration({token});
    // }

    // Max retries reached
    logger.error(`Migration failed for token ${token.mint}`)
    console.log(JSON.stringify(error, null, 2))
    console.log(error.message)
    // logger.error(JSON.parse(error))

    // Handle different error types
    const errorDetails = {
      message: error.message || error.toString(),
      logs: error.logs || [],
      simulationLogs: error.simulationLogs || [],
      stack: error.stack,
      code: error.code,
      name: error.name,
      instruction: error.instruction,
      raw:
        typeof error === "object"
          ? JSON.stringify(error, Object.getOwnPropertyNames(error))
          : error,
    }

    logger.error("Migration failed:", errorDetails)
    logger.error(error.error)
    console.dir(error, { depth: null })

    await Token.findOneAndUpdate(
      { mint: token.mint },
      { status: "migration_failed", lastUpdated: new Date() }
    )
  }
}

;(async () => {
  // const { connection, program, wallet } = await initializeConfig();

  // const monitor = new TokenMonitor(
  //   connection,
  //   program,
  //   process.env.WALLET_PRIVATE_KEY
  // );

  handleMigration({
    mint: "4qbY5Df3VA1QLeUWjPXqFNnKGB7eYmfbdfCiGfD5LEDN",
  })
})()
