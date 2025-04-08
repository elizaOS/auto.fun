import { describe, it, beforeAll, expect } from "vitest";

import { Connection, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { TokenMigrator } from "../migration/migrateToken";
import { getToken } from "../migration/migrations";
import { Env } from "../../env";
import { DurableObjectNamespace } from "@cloudflare/workers-types/experimental";
import { D1Database } from "@cloudflare/workers-types/experimental";
import { R2Bucket } from "@cloudflare/workers-types";
import { KVNamespace } from "@cloudflare/workers-types";
import { logger } from "../../logger";
import { RaydiumVault } from "../types/raydium_vault";
import * as raydium_vault_IDL from "../raydium_vault.json";

import { Autofun } from "../../target/types/autofun";
import { IDL } from "../../../src/utils/program";
import { config } from "dotenv";

config({ path: ".env.test" });
let env: Env;
let connection: Connection;
let wallet: Keypair;
let provider: AnchorProvider;
let program: Program<RaydiumVault>;
let autofunProgram: Program<Autofun>;
let tokenMigrator: TokenMigrator;
let testTokenMint: string;
describe("TokenMigrator Integration Tests", () => {
  beforeAll(() => {
    env = {
      WEBSOCKET_DO: {} as DurableObjectNamespace,
      DB: {} as D1Database,
      NETWORK: process.env.NETWORK || "devnet",
      DECIMALS: process.env.DECIMALS || "9",
      TOKEN_SUPPLY: process.env.TOKEN_SUPPLY || "1000000",
      VIRTUAL_RESERVES: process.env.VIRTUAL_RESERVES || "10000",
      CURVE_LIMIT: process.env.CURVE_LIMIT || "20000",
      WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY || "[]",
      FEE_PERCENTAGE: process.env.FEE_PERCENTAGE || "10",
      CODEX_API_KEY: process.env.CODEX_API_KEY || "",
      R2: {} as R2Bucket,
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || "",
      ASSET_URL: process.env.ASSET_URL || "",
      VITE_API_URL: process.env.VITE_API_URL || "",
      FAL_API_KEY: process.env.FAL_API_KEY || "",
      AI: { run: async (model: string, inputs: any) => ({}) },
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || "",
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || "",
      NODE_ENV: process.env.NODE_ENV || "development",
      SWAP_FEE: process.env.SWAP_FEE || "0.3",
      JWT_SECRET: process.env.JWT_SECRET || "",
      RPC_URL: process.env.RPC_URL || "",
      MAINNET_SOLANA_RPC_URL: process.env.MAINNET_SOLANA_RPC_URL || "",
      DEVNET_SOLANA_RPC_URL: process.env.DEVNET_SOLANA_RPC_URL || "",
      PROGRAM_ID: process.env.PROGRAM_ID || "",
      tokenPubkey: process.env.tokenPubkey || "",
      REDIS: {} as KVNamespace,
      AUTH_TOKENS: {} as KVNamespace,
      AUTH_TOKEN_SALT: process.env.AUTH_TOKEN_SALT || "",
      DEVNET_FRONTEND_URL: process.env.DEVNET_FRONTEND_URL || "",
      MAINNET_FRONTEND_URL: process.env.MAINNET_FRONTEND_URL || "",
      TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
      TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID || "",
      TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
      TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
      TWITTER_ACCESS_TOKEN_SECRET:
        process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
      TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
      NEWS_API_KEY: process.env.NEWS_API_KEY,
      PREGENERATED_TOKENS_COUNT: process.env.PREGENERATED_TOKENS_COUNT,
      HELIUS_WEBHOOK_AUTH_TOKEN: process.env.HELIUS_WEBHOOK_AUTH_TOKEN || "",
      MINIMUM_VANITY_KEYPAIRS: process.env.MINIMUM_VANITY_KEYPAIRS,
      VANITY_GENERATION_ADDRESS: process.env.VANITY_GENERATION_ADDRESS,
      ADMIN_ADDRESSES: process.env.ADMIN_ADDRESSES,
      MANAGER_MULTISIG_ADDRESS: process.env.MANAGER_MULTISIG_ADDRESS || "",
    };

    // Create a Solana connection
    connection = new Connection(env.RPC_URL);

    wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(env.WALLET_PRIVATE_KEY))
    );

    // Create Anchor provider
    provider = new AnchorProvider(
      connection,
      new Wallet(wallet),
      AnchorProvider.defaultOptions()
    );

    // create programs
    program = new Program<RaydiumVault>(raydium_vault_IDL as any, provider);
    autofunProgram = new Program<Autofun>(IDL as any, provider);

    // Initialize the TokenMigrator class
    tokenMigrator = new TokenMigrator(
      env,
      connection,
      wallet,
      program,
      autofunProgram,
      provider
    );

    // test mint address
    testTokenMint = process.env.TEST_MINT || "";
  });
  it("should retrieve a token and migrate it", async () => {
    if (!testTokenMint) {
      throw new Error("TEST_MINT is not defined in environment variables.");
    }

    // Retrieve token data from the database.
    const token = await getToken(env, testTokenMint);
    expect(token).not.toBeNull();
    if (!token) return;

    logger.log(`Token with mint ${testTokenMint} retrieved successfully.`);

    // Call the migration process.
    await tokenMigrator.migrateToken(token);

    // After migration, we expect:
    expect(token.status).toBe("locked");
    expect(token.lockedAmount).toBeDefined();
    expect(token.migration?.withdraw?.status).toBe("success");
    expect(token.migration?.createPool?.status).toBe("success");
    expect(token.migration?.lockLP?.status).toBe("success");
    expect(token.migration?.sendNft?.status).toBe("success");
    expect(token.migration?.depositNft?.status).toBe("success");
    expect(token.migration?.lastStep).toBe("finalize");
    expect(token.lockId).toBeDefined();
    expect(token.nftMinted).toBeDefined();
  });
});
