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

process.on("message", async (data: any) => {
   try {
      const swap = data;
      const token0IsSol =
         swap.token0Address === "So11111111111111111111111111111111111111112";
      const tokenMint = token0IsSol ? swap.token1Address : swap.token0Address;
      const isBuy = swap.eventDisplayType === "Buy";



      const redisCache = await getGlobalRedisCache();
      const isReady = await redisCache.isPoolReady();
      if (!redisCache) throw new Error("Redis Cache Service not found");

      if (!webSocketManager.redisCache) {
         await webSocketManager.initialize(redisCache);
      }


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

      if (!token) return;

      const ext = new ExternalToken(tokenMint);
      await ext.updateLatestSwapData(5);
      const latestCandle = await getLatestCandle(tokenMint, swap, token);
      await ext.updateMarketAndHolders();

      const wsClient = getWebSocketClient();

      await wsClient.to(`token-${tokenMint}`).emit("newCandle", latestCandle);

      process.exit(0);
   } catch (e) {
      logger.error("Webhook child error", e);
      process.exit(1);
   }
});
