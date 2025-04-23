import { parentPort } from "worker_threads";
import { WebSocket } from "ws";
import { getDB, tokens } from "../db";
import { getGlobalRedisCache } from "../redis";
import { eq } from "drizzle-orm";
import { ExternalToken } from "../externalToken";
import { getLatestCandle } from "../chart";
import { getWebSocketClient } from "../websocket-client";
import { logger } from "../util";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import crypto from "node:crypto";
import { webSocketManager } from '../websocket-manager';

parentPort?.on("message", async (data: any) => {
   try {
      const swap = data;
      const token0IsSol =
         swap.token0Address === "So11111111111111111111111111111111111111112";
      const tokenMint = token0IsSol ? swap.token1Address : swap.token0Address;
      const isBuy = swap.eventDisplayType === "Buy";

      let amountIn: number;
      let amountOut: number;
      let price: number;

      if (token0IsSol) {
         if (isBuy) {
            amountIn = Number(swap.data.amount0) * LAMPORTS_PER_SOL;
            amountOut = Number(swap.data.amount1) * 1e6;
            price = amountIn / LAMPORTS_PER_SOL / (amountOut / 1e6);
         } else {
            amountIn = Number(swap.data.amount1) * 1e6;
            amountOut = Number(swap.data.amount0) * LAMPORTS_PER_SOL;
            price = amountOut / LAMPORTS_PER_SOL / (amountIn / 1e6);
         }
      } else {
         if (isBuy) {
            amountIn = Number(swap.data.amount1) * LAMPORTS_PER_SOL;
            amountOut = Number(swap.data.amount0) * 1e6;
            price = amountIn / LAMPORTS_PER_SOL / (amountOut / 1e6);
         } else {
            amountIn = Number(swap.data.amount0) * 1e6;
            amountOut = Number(swap.data.amount1) * LAMPORTS_PER_SOL;
            price = amountOut / LAMPORTS_PER_SOL / (amountIn / 1e6);
         }
      }

      const swapRecord = {
         id: crypto.randomUUID(),
         tokenMint,
         user: swap.maker,
         type: isBuy ? "buy" : "sell",
         direction: isBuy ? 0 : 1,
         amountIn,
         amountOut,
         price,
         txId: swap.transactionHash,
         timestamp: new Date(swap.timestamp * 1000),
      };

      const redisCache = await getGlobalRedisCache();
      const isReady = await redisCache.isPoolReady();
      if (!redisCache) throw new Error("Redis Cache Service not found");

      // Initialize WebSocketManager with Redis
      if (!webSocketManager.redisCache) {
         await webSocketManager.initialize(redisCache);
      }

      const listKey = `swapsList:${tokenMint}`;

      await redisCache.lpushTrim(
         listKey,
         JSON.stringify(swapRecord),
         1000 // Max swaps
      );

      let token = null;
      const cachedToken = await redisCache.get(`codex-webhook:${tokenMint}`);
      if (cachedToken) {
         token = JSON.parse(cachedToken);
      } else {
         const db = getDB();
         const dbToken = await db
            .select()
            .from(tokens)
            .where(eq(tokens.mint, tokenMint));
         if (dbToken?.[0]) {
            await redisCache.set(
               `codex-webhook:${tokenMint}`,
               JSON.stringify(dbToken[0])
            );
            token = dbToken[0];
         }
      }

      if (!token) {
         return;
      }

      const ext = await ExternalToken.create(tokenMint, redisCache);
      await ext.updateLatestSwapData(20);
      const latestCandle = await getLatestCandle(tokenMint, swap, token);
      await ext.updateMarketAndHolders();

      const wsClient = getWebSocketClient();
      await wsClient.to(`token-${tokenMint}`).emit("newSwap", {
         ...swapRecord,
         mint: tokenMint,
         timestamp: swapRecord.timestamp.toISOString(),
      });
      await wsClient.to(`token-${tokenMint}`).emit("newCandle", latestCandle);

      process.exit(0); // Done successfully
   } catch (e) {
      logger.error("Webhook child error", e);
      process.exit(1); // Fail
   }
});
