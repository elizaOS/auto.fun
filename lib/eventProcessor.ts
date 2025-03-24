import { PublicKey } from "@solana/web3.js";
import { SEED_BONDING_CURVE } from "./constant";
import { config } from "./solana";
import { Token, Swap, Fee } from "../schemas";
import {
  createNewTokenData,
  getTxIdAndCreatorFromTokenAddress,
} from "./tokenUtils";
import { getMint } from "@solana/spl-token";
import { getSOLPrice } from "../mcap";
import { statsManager } from "./statsManager";
import { logger } from "../logger";
import { getIoServer } from "./util";
import PQueue from "p-queue";
import { getLatestCandle } from "../server";
import { MigrationService } from "./migration";
const io = getIoServer();

function findLog(logs: string[], keyword: string): string | undefined {
  return logs.find((log) => log.includes(keyword));
}

async function handleMigration(token: any): Promise<void> {
  logger.log(`Handling migration for token ${token.mint}`);
  const migrationService = new MigrationService(
    config.connection,
    config.program,
    this.wallet,
    io
  );
  await migrationService.migrateToken(token);
}

const queue = new PQueue({
  concurrency: 5,
  interval: 1000,
  intervalCap: 10,
});

// Processes an individual log event from a block.
export async function handleLogEvent(event: {
  slot: number;
  logs: string[];
  signature: string;
  err: any;
}): Promise<void> {
  try {
    // Skip if the event contains an error
    if (event.err) return;

    const logs = event.logs;

    // Extract relevant log lines
    const mintLog = findLog(logs, "Mint:");
    const swapLog = findLog(logs, "Swap:");
    const reservesLog = findLog(logs, "Reserves:");
    const feeLog = findLog(logs, "fee:");
    const swapeventLog = findLog(logs, "SwapEvent:");
    const newTokenLog = findLog(logs, "NewToken:");
    const completeEventLog = findLog(logs, "curve is completed");
    let slotTime = new Date();
    const blockTime = await config.connection.getBlockTime(event.slot);
    if (blockTime !== null) {
      slotTime = new Date(blockTime * 1000); // Convert seconds to milliseconds
    }
    logger.log(`Processing log event at slot ${event.slot} (${slotTime})`);

    // Process "curve complete" events
    if (completeEventLog && mintLog) {
      try {
        const mintAddress = mintLog
          .split("Mint:")[1]
          .trim()
          .replace(/[",)]/g, "");
        const [bondingCurvePda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from(SEED_BONDING_CURVE),
            new PublicKey(mintAddress).toBytes(),
          ],
          config.program.programId
        );
        queue.add(async () => {
          const maxRetries = 15;
          for (let i = 0; i < maxRetries; i++) {
            try {
              // Fetch the bonding curve account to verify completion
              const bondingCurveAccount =
                await config.program.account.bondingCurve.fetch(
                  bondingCurvePda
                );
              if (bondingCurveAccount && bondingCurveAccount.isCompleted) {
                const token = await Token.findOne({ mint: mintAddress });
                if (token) {
                  logger.log(
                    "Bonding Curve CompleteEvent confirmed for token:",
                    token.mint
                  );
                  const existingToken = await Token.findOne({
                    mint: mintAddress,
                  });
                  if (
                    existingToken &&
                    ["migrating", "withdrawn", "migrated", "locked"].includes(
                      existingToken.status
                    )
                  ) {
                    logger.log(
                      `Token ${mintAddress} is already in process: ${existingToken.status}`
                    );
                    return;
                  }
                  // Update token status to migrating and trigger migration handling
                  await Token.findOneAndUpdate(
                    { mint: mintAddress },
                    { status: "migrating", lastUpdated: slotTime },
                    { new: true }
                  );
                  await handleMigration(token);
                }
              }
            } catch (error) {
              logger.error(
                `Error processing complete event for token ${mintAddress}:`,
                error
              );
              if (i === maxRetries - 1) {
                logger.error(
                  `Failed to process complete event for token ${mintAddress} after ${maxRetries} retries.`
                );
              }
            }
          }
        });
      } catch (error) {
        logger.error("Error processing complete event:", error);
      }
    }

    // Process new token events
    if (newTokenLog) {
      try {
        const parts = newTokenLog.split(" ");
        const tokenAddress = parts[parts.length - 2].replace(/[",)]/g, "");
        const creatorAddress = parts[parts.length - 1].replace(/[",)]/g, "");
        const newToken = await createNewTokenData(
          event.signature,
          tokenAddress,
          creatorAddress
        );
        const tokenData = await Token.findOneAndUpdate(
          { mint: tokenAddress },
          newToken,
          {
            upsert: true,
            new: true,
          }
        );
        io.to("global").emit("newToken", tokenData);
        logger.log(`New token event processed for ${tokenAddress}`);
      } catch (error) {
        logger.error("Error processing new token event:", error);
      }
    }

    // If there’s no "success" in the logs, skip further processing.
    if (!logs.some((msg) => msg.includes("success"))) {
      return;
    }

    // Process swap-related events if the necessary logs are present.
    if (mintLog && swapLog && reservesLog && feeLog && swapeventLog) {
      try {
        const mintAddress = mintLog
          .split("Mint:")[1]
          .trim()
          .replace(/[",)]/g, "");
        const [user, direction, amount] = swapLog
          .split(" ")
          .slice(-3)
          .map((s) => s.replace(/[",)]/g, ""));
        const [reserveToken, reserveLamport] = reservesLog
          .split(" ")
          .slice(-2)
          .map((s) => s.replace(/[",)]/g, ""));
        const feeAmount = feeLog.split("fee:")[1].trim().replace(/[",)]/g, "");
        const [, , amountOut] = swapeventLog
          .split(" ")
          .slice(-3)
          .map((s) => s.replace(/[",)]/g, ""));

        // Retrieve token mint info to get decimals.
        const tokenMint = new PublicKey(mintAddress);
        const tokenDataFromChain = await getMint(config.connection, tokenMint);
        const SOL_DECIMALS = 9;
        const TOKEN_DECIMALS = tokenDataFromChain.decimals;

        // Basic check on the signature to avoid invalid transactions.
        if (event.signature && event.signature.match(/^1{64}$/)) {
          logger.log("Invalid signature:", event.signature);
          return;
        }

        // Create or update the swap record.
        const swap = await Swap.findOneAndUpdate(
          { txId: event.signature },
          {
            tokenMint: mintAddress,
            user: user,
            direction: parseInt(direction),
            type: direction === "1" ? "sell" : "buy",
            amountIn: Number(amount),
            amountOut: Number(amountOut),
            price:
              direction === "1"
                ? Number(amountOut) /
                  Math.pow(10, SOL_DECIMALS) /
                  (Number(amount) / Math.pow(10, TOKEN_DECIMALS))
                : Number(amount) /
                  Math.pow(10, SOL_DECIMALS) /
                  (Number(amountOut) / Math.pow(10, TOKEN_DECIMALS)),
            txId: event.signature,
          },
          { upsert: true, new: true }
        );

        // Get current SOL price and calculate token pricing details.
        const solPrice = await getSOLPrice();
        const currentPrice =
          Number(reserveLamport) /
          1e9 /
          (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS));
        const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
        const tokenPriceUSD =
          currentPrice > 0
            ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
            : 0;
        const marketCapUSD =
          (Number(process.env.TOKEN_SUPPLY) / Math.pow(10, TOKEN_DECIMALS)) *
          tokenPriceUSD;

        logger.log("reserveLamport", Number(reserveLamport));
        logger.log("reserveToken", Number(reserveToken));
        logger.log("currentPrice", currentPrice);
        logger.log("tokenPriceUSD", tokenPriceUSD);
        logger.log("marketCapUSD", marketCapUSD);

        // If token is not fully initialized, try to generate its base data.
        const existingToken = await Token.findOne({ mint: mintAddress });
        let baseToken: Partial<any> = {};
        if (!existingToken?.name) {
          const { creatorAddress, tokenCreationTxId } =
            await getTxIdAndCreatorFromTokenAddress(mintAddress);
          const { volume24h, ...tokenData } = await createNewTokenData(
            tokenCreationTxId,
            mintAddress,
            creatorAddress
          );
          baseToken = tokenData;
        }

        const priceChange = existingToken?.price24hAgo
          ? ((tokenPriceUSD - existingToken.price24hAgo) /
              existingToken.price24hAgo) *
            100
          : 0;

        // Update the token record with new pricing and liquidity data.
        const token = await Token.findOneAndUpdate(
          { mint: mintAddress },
          {
            ...baseToken,
            reserveAmount: Number(reserveToken),
            reserveLamport: Number(reserveLamport),
            currentPrice: currentPrice,
            liquidity:
              (Number(reserveLamport) / 1e9) * solPrice +
              (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS)) *
                tokenPriceUSD,
            marketCapUSD: marketCapUSD,
            tokenPriceUSD: tokenPriceUSD,
            solPriceUSD: solPrice,
            curveProgress:
              ((Number(reserveLamport) - Number(process.env.VIRTUAL_RESERVES)) /
                (Number(process.env.CURVE_LIMIT) -
                  Number(process.env.VIRTUAL_RESERVES))) *
              100,
            lastUpdated: slotTime,
            $inc: {
              volume24h:
                direction === "1"
                  ? (Number(amount) / Math.pow(10, TOKEN_DECIMALS)) *
                    tokenPriceUSD
                  : (Number(amountOut) / Math.pow(10, TOKEN_DECIMALS)) *
                    tokenPriceUSD,
            },
            $set: {
              priceChange24h: priceChange,
              ...((!existingToken?.price24hAgo ||
                Date.now() - (existingToken?.lastPriceUpdate?.getTime() || 0) >
                  24 * 60 * 60 * 1000) && {
                price24hAgo: tokenPriceUSD,
                lastPriceUpdate: slotTime,
              }),
            },
          },
          { upsert: true, new: true }
        );

        // Create the fee record.
        await Fee.findOneAndUpdate(
          { txId: event.signature },
          {
            tokenMint: mintAddress,
            user: user,
            direction: parseInt(direction),
            type: "swap",
            tokenAmount: "0",
            solAmount: feeAmount,
            feeAmount: feeAmount,
            txId: event.signature,
          },
          { new: true }
        );

        // Reset volume if more than 24 hours have passed since last reset.
        const ONE_HOUR = 60 * 60 * 1000;
        const ONE_DAY = 24 * ONE_HOUR;
        const lastVolumeReset = token.lastVolumeReset || new Date(0);
        if (slotTime.getTime() - lastVolumeReset.getTime() > ONE_DAY) {
          await Token.findOneAndUpdate(
            { mint: mintAddress },
            { volume24h: 0, lastVolumeReset: slotTime }
          );
        }

        // Update price24hAgo if needed.
        const lastPriceUpdate = token.lastPriceUpdate || new Date(0);
        if (slotTime.getTime() - lastPriceUpdate.getTime() > ONE_HOUR) {
          await Token.findOneAndUpdate(
            { mint: mintAddress },
            {
              price24hAgo: tokenPriceUSD,
              lastPriceUpdate: slotTime,
              priceChange24h: token.price24hAgo
                ? ((tokenPriceUSD - token.price24hAgo) / token.price24hAgo) *
                  100
                : 0,
            }
          );
        }

        // Do we need to update the holder count here as well?

        // Emit swap-related events via Socket.IO.
        io.to(`token-${swap.tokenMint}`).emit("newSwap", {
          tokenMint: swap.tokenMint,
          user: swap.user,
          price: swap.price,
          type: swap.type,
          amountIn: swap.amountIn,
          amountOut: swap.amountOut,
          timestamp: swap.timestamp,
          direction: swap.direction,
          txId: swap.txId,
        });

        // Emit candle and token updates.
        const latestCandle = await getLatestCandle(swap.tokenMint, swap);
        io.to(`token-${swap.tokenMint}`).emit("newCandle", latestCandle);
        const enrichedToken = statsManager.enrichTokenWithScore(token);
        io.to(`token-${swap.tokenMint}`).emit("updateToken", enrichedToken);
        io.to("global").emit("updateToken", enrichedToken);

        logger.log(`Recorded swap and fee for tx: ${event.signature}`);
      } catch (error) {
        logger.error("Error processing swap logs:", error);
      }
    }
  } catch (error) {
    logger.error("Error in handleLogEvent:", error);
  }
}
