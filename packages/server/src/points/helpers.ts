import { eq, gt, sql } from "drizzle-orm";
import { getDB, tokens, users } from "../db";
import { getToken } from "../migration/migrations";

import { Env } from "../env";
import { getGlobalRedisCache } from "../redis";
// point events for now
export type PointEvent =
  | { type: "wallet_connected" }
  | { type: "creator_token_bonds" }
  | { type: "prebond_buy"; usdVolume: number }
  | { type: "postbond_buy"; usdVolume: number }
  | { type: "prebond_sell"; usdVolume: number }
  | { type: "postbond_sell"; usdVolume: number }
  | { type: "trade_volume_bonus"; usdVolume: number } // >$10/$100
  | { type: "successful_bond" }
  | { type: "daily_holding"; usdHeld: number } // per day
  | { type: "graduation_holding"; heldAtGraduation: number } // value at graduation
  | { type: "graduating_tx" } // tx at graduation
  | { type: "referral" }
  | { type: "daily_trading_streak"; days: number }
  | { type: "first_buyer" }
  | { type: "owner_graduation" }; // owner graduation bonus

// helper calc points per event
function calculatePoints(evt: PointEvent): number {
  switch (evt.type) {
    case "wallet_connected":
      return 50;
    case "creator_token_bonds":
      return 50;
    case "prebond_buy":
      return Math.min(evt.usdVolume * 0.6);
    case "postbond_buy":
      return Math.min(evt.usdVolume * 0.02);
    case "prebond_sell":
      return Math.min(evt.usdVolume * 0.1);
    case "postbond_sell":
      return Math.min(evt.usdVolume * 0.01);
    case "trade_volume_bonus":
      if (evt.usdVolume > 100) return 500;
      if (evt.usdVolume > 10) return 10;
      return 0;
    case "successful_bond":
      return 500;
    case "daily_holding":
      return Math.floor(evt.usdHeld / 100) * 1;
    case "graduation_holding":
      return Math.floor(evt.heldAtGraduation / 100) * 1.5;
    case "graduating_tx":
      return 1000;
    case "owner_graduation":
      return 500;
    case "referral":
      return 100;
    case "daily_trading_streak":
      return Math.min(evt.days * 10, 280);
    case "first_buyer":
      return 200;
    default:
      return 0;
  }
}

export async function awardUserPoints(
  userAddress: string,
  event: PointEvent,
  description = "",
): Promise<void> {
  const db = getDB();
  const now = new Date();
  const pointsToAdd = calculatePoints(event);
  if (pointsToAdd <= 0) return;

  // 1) Upsert into user_points
  //   await db
  //     .insert(userPoints)
  //     .values({
  //       id: uuidv4(),
  //       userAddress,
  //       eventType: event.type,
  //       pointsAwarded: pointsToAdd,
  //       description,
  //       timestamp: now,
  //     })
  //     .onConflictDoUpdate({
  //       target: [userPoints.userAddress, userPoints.eventType],
  //       set: {
  //          pointsAwarded: sql`${userPoints.pointsAwarded} + ${pointsToAdd}`,
  //         description,
  //         timestamp: now,
  //       },
  //     })
  //     .execute();
  // this needs to be moved to a new database/system
  //so we can keep logs of each event where a user was rewarded points {/* Malibu To do */}

  // 2) Update running total in users table
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.address, userAddress))
    .limit(1)
    .execute();

  if (existing.length) {
    await db
      .update(users)
      .set({
        points: sql`${users.points} + ${pointsToAdd}`,
      })
      .where(eq(users.address, userAddress))
      .execute();
  } else {
    await db
      .insert(users)
      .values([
        {
          address: userAddress,
          name: null,
          points: pointsToAdd,
          rewardPoints: 0,
          createdAt: now,
        },
      ])
      .execute();
  }
}

export async function awardGraduationPoints(
  mint: string,
): Promise<void> {
  const db = getDB();
  const redisCache = await getGlobalRedisCache();

  // Last swap user
  let lastSwapUser: string | null = null;
  try {
    const listKey = `swapsList:${mint}`;
    const [lastSwapString] = await redisCache.lrange(listKey, 0, 0); // Get the first item (most recent)

    if (lastSwapString) {
      const lastSwapData = JSON.parse(lastSwapString);
      lastSwapUser = lastSwapData?.user;
    }
  } catch (redisError) {
    // Use logger if available, otherwise console.error
    console.error(
      `Failed to get last swap user from Redis for ${mint}:`,
      redisError,
    );
    // Continue without awarding points for last swap if Redis fails
  }

  if (lastSwapUser) {
    await awardUserPoints(
      lastSwapUser, // Use user fetched from Redis
      { type: "graduating_tx" },
      "Graduating transaction bonus",
    );
  }

  // Owner graduation
  const tokenRecord = await getToken(mint);
  const creator = tokenRecord?.creator;
  if (creator) {
    await awardUserPoints(
      creator,
      { type: "owner_graduation" },
      "Owner graduation bonus",
    );
  }

  // Holding through graduation
  let holders: any[] = [];
  const holdersListKey = `holders:${mint}`;
  try {
    const holdersString = await redisCache.get(holdersListKey);
    if (holdersString) {
      holders = JSON.parse(holdersString);
    } else {
      // Use logger if available
      console.log(
        `No holders found in Redis for ${mint} during graduation point calculation.`,
      );
    }
  } catch (redisError) {
    console.error(
      `Failed to get holders from Redis for graduation points (${mint}):`,
      redisError,
    );
    // Continue without awarding holder points if Redis fails
  }

  const [priceRow] = await db
    .select({ tokenPriceUSD: tokens.tokenPriceUSD })
    .from(tokens)
    .where(eq(tokens.mint, mint))
    .limit(1)
    .execute();

  const priceAtGraduation = priceRow?.tokenPriceUSD ?? 0;

  for (const h of holders) {
    const usdHeld = (h.amount || 0) * priceAtGraduation;
    await awardUserPoints(
      h.address,
      { type: "graduation_holding", heldAtGraduation: usdHeld },
      `Holding through graduation: $${usdHeld.toFixed(2)}`,
    );
  }
}

/* Malibu To do: add this to a cron job to run once a week */
export async function distributeWeeklyPoints(
  weeklyPool = 1_000_000,
  capPercent = 0.02,
): Promise<{ distributed: number; unassigned: number }> {
  const db = getDB();

  const allUsers = await db
    .select({
      address: users.address,
      points: users.points,
    })
    .from(users)
    .where(gt(users.points, 0))
    .execute();

  // 2) Compute sum of all points
  const totalPoints = allUsers.reduce((sum, u) => sum + (u.points || 0), 0);
  if (totalPoints === 0) {
    return { distributed: 0, unassigned: weeklyPool };
  }

  const cap = Math.floor(weeklyPool * capPercent); // cap is 2% of the weekly pool (20k)
  let distributed = 0;

  // calculate the users share and apply cap
  for (const u of allUsers) {
    const shareRaw = (u.points! / totalPoints) * weeklyPool;
    const share = Math.min(Math.floor(shareRaw), cap);

    if (share <= 0) continue;

    await db
      .update(users)
      .set({
        rewardPoints: sql`${users.rewardPoints} + ${share}`,
      })
      .where(eq(users.address, u.address))
      .execute();

    distributed += share;
  }

  const unassigned = weeklyPool - distributed;
  return { distributed, unassigned };
}
