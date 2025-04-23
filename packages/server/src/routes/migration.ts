import * as IDL from "@autodotfun/types/idl/autofun.json";
import * as raydium_vault_IDL from "@autodotfun/types/idl/raydium_vault.json";
import { Autofun } from "@autodotfun/types/types/autofun";
import { checkBalance } from "@autodotfun/raydium/src/raydiumVault";
import { RaydiumVault } from "@autodotfun/types/types/raydium_vault";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDB, Token, tokens, users } from "../db";
import { TokenMigrator } from "../migration/migrateToken";
import { Wallet } from "../tokenSupplyHelpers/customWallet";
import { createNewTokenData, logger } from "../util";
import { getWebSocketClient } from "../websocket-client";

const migrationRouter = new Hono<{
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// middleware to check if the request is authorized
migrationRouter.use("/migration", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = authHeader ? authHeader.split(" ")[1] : null;
  if (!apiKey || apiKey !== process.env.JWT_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

migrationRouter.post("/migration/resume", async (c) => {
  try {
    const token = await c.req.json();
    if (!token || !token.mint) {
      return c.json({ error: "Invalid token data provided" }, 400);
    }

    // Create connection based on the environment setting.
    const connection = new Connection(
      process.env.NETWORK === "devnet"
        ? process.env.DEVNET_SOLANA_RPC_URL || ""
        : process.env.MAINNET_SOLANA_RPC_URL || "",
    );

    if (!process.env.WALLET_PRIVATE_KEY) {
      throw new Error("Wallet private key not found");
    }

    // Create a wallet using the secret from process.env.
    const wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
    );

    // Build an Anchor provider.
    const provider = new AnchorProvider(
      connection,
      new Wallet(wallet),
      AnchorProvider.defaultOptions(),
    );

    const program = new Program<RaydiumVault>(
      raydium_vault_IDL as any,
      provider,
    );
    const autofunProgram = new Program<Autofun>(IDL, provider);

    // Create an instance of TokenMigrator.
    const tokenMigrator = new TokenMigrator(
      connection,
      new Wallet(wallet),
      program,
      autofunProgram as any,
      provider,
    );

    // Call migrateToken: process the next migration step.
    // await tokenMigrator.migrateToken(token);

    // Return a success response.
    return c.json({
      status: "Migration invocation processed",
      tokenMint: token.mint,
    });
  } catch (error) {
    logger.error("Error in migration resume endpoint:", error);
    return c.json({ error: "Failed to process migration invocation" }, 500);
  }
});

// claim endpoint
migrationRouter.post("/claimFees", async (c) => {
  try {
    const user = c.get("user");

    // requireAuth middleware ensures user exists, but let's double-check
    if (!user) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const db = getDB();
    const userInfo = await db
      .select()
      .from(users)
      .where(eq(users.address, user.publicKey))
      .limit(1);
    const body = await c.req.json();
    const { tokenMint } = body;
    const token = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, tokenMint))
      .limit(1)
      .then((result) => result[0]);

    if (
      !token ||
      !token.mint ||
      !token.nftMinted ||
      !token.marketId ||
      !token.creator
    ) {
      return c.json({ error: "Invalid token data or token not found " }, 400);
    }

    //check if the user is the creator of the token
    if (userInfo.length === 0 || userInfo[0].address !== token.creator) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const nftMint = token.nftMinted?.split(",")[0];
    const poolId = token.marketId;

    const payload = {
      tokenMint: token.mint,
      nftMint,
      poolId,
      userAddress: token.creator,
    };

    await fetch(`https://autofun-production.up.railway.app/claim-fees`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.JWT_SECRET}`,
      },
      body: JSON.stringify(payload),
    });

    // Return a success response.
    return c.json({
      status: "Claim invocation processing started",
      tokenMint: token.mint,
    });
  } catch (error: any) {
    logger.error("Error in claim fees endpoint:", error);
    return c.json(
      { error: `Failed to process claim invocation ${error.message}` },
      500,
    );
  }
});

// checkBalance endpoint
migrationRouter.get("/checkBalance", async (c) => {
  try {
    const user = c.get("user");
    const tokenMint = c.req.query("tokenMint");
    if (!tokenMint) {
      return c.json({ error: "Token mint address is required" }, 400);
    }

    // requireAuth middleware ensures user exists, but let's double-check
    if (!user) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const db = getDB();
    const userInfo = await db
      .select()
      .from(users)
      .where(eq(users.address, user.publicKey))
      .limit(1);

    if (userInfo.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }
    // get the token
    const token = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, tokenMint))
      .limit(1)
      .then((result) => result[0]);
    if (!token) {
      return c.json({ error: "Token not found" }, 404);
    }
    // check if the user is the creator of the token
    if (userInfo[0].address !== token.creator) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const positionNft = token.nftMinted?.split(",")[0];

    if (!positionNft) {
      return c.json({ error: "Position NFT not found" }, 404);
    }

    if (!process.env.WALLET_PRIVATE_KEY) {
      throw new Error("Wallet private key not found");
    }

    // Create a wallet using the secret from process.env.
    const wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
    );

    // Create connection based on the environment setting.
    const connection = new Connection(
      process.env.NETWORK === "devnet"
        ? process.env.DEVNET_SOLANA_RPC_URL || ""
        : process.env.MAINNET_SOLANA_RPC_URL || "",
    );

    const checkBalanceResult = await checkBalance(
      connection,
      wallet,
      new PublicKey(positionNft),
      new PublicKey(user.publicKey),
    );

    return c.json({ balance: checkBalanceResult });
  } catch (error) {
    logger.error("Error in checkBalance endpoint:", error);
    return c.json({ error: "Failed to process checkBalance invocation" }, 500);
  }
});

migrationRouter.post("/migration/update", async (c) => {
  try {
    const body = await c.req.json();
    const { step, mint, migration, status, ...extra } = body;

    if (!mint || migration === undefined) {
      return c.json({ error: "mint and migration are required" }, 400);
    }

    // 2) normalize migration to string for storage
    const migrationStr =
      typeof migration === "string" ? migration : JSON.stringify(migration);

    // 3) prepare update fields
    const updateData: Record<string, any> = {
      migration: migrationStr,
      last_updated: new Date().toISOString(),
    };
    if (status) updateData.status = status;
    if (extra.lockedAt) updateData.locked_at = extra.lockedAt;
    Object.assign(updateData, extra);

    // 4) write to db
    const db = getDB();
    const token = await db
      .update(tokens)
      .set(updateData)
      .where(eq(tokens.mint, mint))
      .execute();

    // emit event to notify
    const ws = getWebSocketClient();

    if (step === "finalize") {
      ws.to(`token-${mint}`).emit("updateToken", token);
    }
    return c.json({ ok: true, mint });
  } catch (err) {
    logger.error("Error in /migration/update:", err);
    return c.json({ error: "Failed to update migration state" }, 500);
  }
});

// migration add missing tokens
migrationRouter.post("/migration/addMissingTokens", async (c) => {
  try {
    const body = await c.req.json();
    const { rawTokenAddress, rawCreatorAddress, signature } = body;

    if (!rawTokenAddress) {
      return c.json({ error: "Invalid token data provided" }, 400);
    }

    // check if we have token in the database
    const db = getDB();
    const existingTokens = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, rawTokenAddress));

    if (existingTokens.length > 0) {
      return c.json({ error: "Tokens already exist in the database" }, 400);
    }

    // add token to the database if it is missing
    const newToken = await createNewTokenData(
      signature,
      rawTokenAddress,
      rawCreatorAddress,
    );
    await getDB()
      .insert(tokens)
      .values(newToken as Token)
      .onConflictDoNothing();
    // Return a success response.
    return c.json({
      status: "added missing token",
      rawTokenAddress,
    });
  } catch (error) {
    logger.error("Error in migration add missing tokens endpoint:", error);
    return c.json({ error: "Failed to process migration invocation" }, 500);
  }
});

export default migrationRouter;
