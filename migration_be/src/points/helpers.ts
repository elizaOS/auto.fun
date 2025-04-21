import { eq, sql, gt } from "drizzle-orm";
import { getDB, users, swaps, tokenHolders, tokens } from "../db";
import { getToken } from "../raydium/migration/migrations";

import { v4 as uuidv4 } from "uuid";
import { Env } from "../env";

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
  env: Env,
  userAddress: string,
  event: PointEvent,
  description = "",
): Promise<void> {
  const db = getDB(env);
  const now = new Date().toISOString();
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
          points: pointsToAdd,
          rewardPoints: 0,
          createdAt: sql`CURRENT_TIMESTAMP`,

          suspended: 0,
        },
      ])
      .returning()
  }
}

export async function awardGraduationPoints(
  env: Env,
  mint: string,
): Promise<void> {
  const db = getDB(env);

  // Last swap user
  const [lastSwap] = await db
    .select()
    .from(swaps)
    .where(eq(swaps.tokenMint, mint))
    .orderBy(sql`timestamp DESC`)
    .limit(1)
    .execute();

  if (lastSwap?.user) {
    await awardUserPoints(
      env,
      lastSwap.user,
      { type: "graduating_tx" },
      "Graduating transaction bonus",
    );
  }

  // Owner graduation
  const tokenRecord = await getToken(env, mint);
  const creator = tokenRecord?.creator;
  if (creator) {
    await awardUserPoints(
      env,
      creator,
      { type: "owner_graduation" },
      "Owner graduation bonus",
    );
  }

  // Holding through graduation
  const holders = await db
    .select()
    .from(tokenHolders)
    .where(eq(tokenHolders.mint, mint))
    .execute();

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
      env,
      h.address,
      { type: "graduation_holding", heldAtGraduation: usdHeld },
      `Holding through graduation: $${usdHeld.toFixed(2)}`,
    );
  }
}

/* Malibu To do: add this to a cron job to run once a week */
export async function distributeWeeklyPoints(
  env: Env,
  weeklyPool = 1_000_000,
  capPercent = 0.02,
): Promise<{ distributed: number; unassigned: number }> {
  const db = getDB(env);

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
