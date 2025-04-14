import { Wallet } from "../tokenSupplyHelpers/customWallet";
import { RaydiumVault } from "../raydium/types/raydium_vault";
import * as raydium_vault_IDL from "../raydium/raydium_vault.json";
import { Autofun } from "../target/types/autofun";
import * as IDL from "../target/idl/autofun.json";
import { TokenMigrator } from "../raydium/migration/migrateToken";
import { Hono } from "hono";
import { Env } from "../env";
import { z } from "zod";
import { logger } from "../logger";
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";

const migrationRouter = new Hono<{
   Bindings: Env;
   Variables: {
      user?: { publicKey: string } | null;
   };
}>();

// middleware to check if the request is authorized
migrationRouter.use("/migration", async (c, next) => {
   const authHeader = c.req.header("Authorization");
   const apiKey = authHeader ? authHeader.split(" ")[1] : null;
   if (!apiKey || apiKey !== c.env.JWT_SECRET) {
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
         c.env.NETWORK === "devnet"
            ? c.env.DEVNET_SOLANA_RPC_URL
            : c.env.MAINNET_SOLANA_RPC_URL
      );

      // Create a wallet using the secret from env.
      const wallet = Keypair.fromSecretKey(
         Uint8Array.from(JSON.parse(c.env.WALLET_PRIVATE_KEY))
      );

      // Build an Anchor provider.
      const provider = new AnchorProvider(
         connection,
         new Wallet(wallet),
         AnchorProvider.defaultOptions()
      );

      const program = new Program<RaydiumVault>(
         raydium_vault_IDL as any,
         provider
      );
      const autofunProgram = new Program<Autofun>(IDL as any, provider);


      // Create an instance of TokenMigrator.
      const tokenMigrator = new TokenMigrator(
         c.env,
         connection,
         new Wallet(wallet),
         program,
         autofunProgram,
         provider
      );

      // Call migrateToken: process the next migration step.
      await tokenMigrator.migrateToken(token);

      // Return a success response.
      return c.json({ status: "Migration invocation processed", tokenMint: token.mint });
   } catch (error) {
      logger.error("Error in migration resume endpoint:", error);
      return c.json({ error: "Failed to process migration invocation" }, 500);
   }
});

export default migrationRouter;