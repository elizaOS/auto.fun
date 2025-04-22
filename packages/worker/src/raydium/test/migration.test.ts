// import { describe, it, beforeAll, expect } from "vitest";

// import { Connection, Keypair } from "@solana/web3.js";
// import { Program, AnchorProvider } from "@coral-xyz/anchor";
// import { TokenMigrator } from "../migration/migrateToken";
// import { getToken } from "../migration/migrations";
// import { Env } from "../../env";
// import { DurableObjectNamespace } from "@cloudflare/workers-types/experimental";
// import { D1Database } from "@cloudflare/workers-types/experimental";
// import { R2Bucket } from "@cloudflare/workers-types";
// import { KVNamespace } from "@cloudflare/workers-types";
// import { logger } from "../../utils";
// import { RaydiumVault } from "../types/raydium_vault";
// import * as raydium_vault_IDL from "../raydium_vault.json";

// import { Autofun } from "../../target/types/autofun";
// import { IDL } from "../../../src/utils/program";
// import { config } from "dotenv";
// import {Wallet} from "../../tokenSupplyHelpers/customWallet"

// config({ path: ".env.test" });
// let env: Env;
// let connection: Connection;
// let wallet: Keypair;
// let provider: AnchorProvider;
// let program: Program<RaydiumVault>;
// let autofunProgram: Program<Autofun>;
// let tokenMigrator: TokenMigrator;
// let testTokenMint: string;
// describe("TokenMigrator Integration Tests", () => {
//   beforeAll(() => {
//     env = {
//       WEBSOCKET_DO: {} as DurableObjectNamespace,
//       DB: {} as D1Database,
//       NETWORK: process.env.NETWORK || "devnet",
//       DECIMALS: process.env.DECIMALS || "9",
//       TOKEN_SUPPLY: process.env.TOKEN_SUPPLY || "1000000000000000",
//       VIRTUAL_RESERVES: process.env.VIRTUAL_RESERVES || "100",
//       CURVE_LIMIT: process.env.CURVE_LIMIT || "1130000000",
//       WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY || "[]",
//       FEE_PERCENTAGE: process.env.FEE_PERCENTAGE || "10",
//       CODEX_API_KEY: process.env.CODEX_API_KEY || "",
//       R2: {} as R2Bucket,
//       R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || "",
//       VITE_API_URL: process.env.VITE_API_URL || "",
//       FAL_API_KEY: process.env.FAL_API_KEY || "",
//       AI: { run: async (model: string, inputs: any) => ({}) },
//       CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || "",
//       CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || "",
//       NODE_ENV: process.env.NODE_ENV || "development",
//       SWAP_FEE: process.env.SWAP_FEE || "0.3",
//       JWT_SECRET: process.env.JWT_SECRET || "",
//       RPC_URL: (process.env.NETWORK === "mainnet"
//         ? process.env.MAINNET_SOLANA_RPC_URL
//         : process.env.DEVNET_SOLANA_RPC_URL) as string,
//       MAINNET_SOLANA_RPC_URL: process.env.MAINNET_SOLANA_RPC_URL || "",
//       DEVNET_SOLANA_RPC_URL: process.env.DEVNET_SOLANA_RPC_URL || "",
//       PROGRAM_ID: process.env.PROGRAM_ID || "",
//       tokenPubkey: process.env.tokenPubkey || "",
//       REDIS: {} as KVNamespace,
//       AUTH_TOKENS: {} as KVNamespace,
//       AUTH_TOKEN_SALT: process.env.AUTH_TOKEN_SALT || "",
//       DEVNET_FRONTEND_URL: process.env.DEVNET_FRONTEND_URL || "",
//       MAINNET_FRONTEND_URL: process.env.MAINNET_FRONTEND_URL || "",
//       TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || "",
//       TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID || "",
//       TWITTER_API_KEY: process.env.TWITTER_API_KEY || "",
//       TWITTER_API_SECRET: process.env.TWITTER_API_SECRET || "",
//       TWITTER_ACCESS_TOKEN_SECRET:
//         process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
//       TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || "",
//       NEWS_API_KEY: process.env.NEWS_API_KEY,
//       PREGENERATED_TOKENS_COUNT: process.env.PREGENERATED_TOKENS_COUNT,
//       HELIUS_WEBHOOK_AUTH_TOKEN: process.env.HELIUS_WEBHOOK_AUTH_TOKEN || "",
//       VANITY_GENERATION_ADDRESS: process.env.VANITY_GENERATION_ADDRESS,
//       ADMIN_ADDRESSES: process.env.ADMIN_ADDRESSES,
//       MANAGER_MULTISIG_ADDRESS: process.env.MANAGER_MULTISIG_ADDRESS || "",
//       LOCAL_DEV: process.env.LOCAL_DEV || "false",
//     };
//     // check for required env variables

//     if (!env.DB) {
//       throw new Error("DB is not defined in environment variables.");
//     }
//     if (!env.MAINNET_SOLANA_RPC_URL) {
//       throw new Error("RPC_URL is not defined in environment variables.");
//     }
//     if (!env.WALLET_PRIVATE_KEY) {
//       throw new Error(
//         "WALLET_PRIVATE_KEY is not defined in environment variables."
//       );
//     }

//     if (!env.MANAGER_MULTISIG_ADDRESS) {
//       throw new Error(
//         "MANAGER_MULTISIG_ADDRESS is not defined in environment variables."
//       );
//     }
//     // Create a Solana connection
//     connection = new Connection(env.MAINNET_SOLANA_RPC_URL);

//      wallet = Keypair.fromSecretKey(
//       Uint8Array.from(JSON.parse(env.WALLET_PRIVATE_KEY)),
//      );

//     // Create Anchor provider
//     provider = new AnchorProvider(
//       connection,
//       new Wallet(wallet),
//       AnchorProvider.defaultOptions(),
//     );

//     // create programs
//     program = new Program<RaydiumVault>(raydium_vault_IDL as any, provider);
//     autofunProgram = new Program<Autofun>(IDL as any, provider);

//     // Initialize the TokenMigrator class
//     tokenMigrator = new TokenMigrator(
//       env,
//       connection,
//       new Wallet(wallet),
//       program,
//       autofunProgram,
//       provider,
//     );

//     // test mint address
//      testTokenMint = "kh4dUsUmVxvb5RUcjx3mpcjhWMaCbKn1bnPEbTkxFUN";
//   });
//   it("should retrieve a token and migrate it", async () => {
//     if (!testTokenMint) {
//       throw new Error("TEST_MINT is not defined in environment variables.");
//     }

//     // Retrieve token data from the database.
//     const token = await getToken(env, testTokenMint);
//     expect(token).not.toBeNull();
//     if (!token) return;

//     logger.log(`Token with mint ${testTokenMint} retrieved successfully.`);

//     // Call the migration process.
//     await tokenMigrator.migrateToken(token);

//     // After migration, re-fetch the token from the DB.
//     const updatedToken = await getToken(env, testTokenMint);
//     expect(updatedToken).not.toBeNull();
//     if (updatedToken) {
//       expect(updatedToken.status).toBe("locked");
//       expect(updatedToken.lockedAmount).toBeDefined();
//       expect(updatedToken.migration?.withdraw?.status).toBe("success");
//       expect(updatedToken.migration?.createPool?.status).toBe("success");
//       expect(updatedToken.migration?.lockLP?.status).toBe("success");
//       expect(updatedToken.migration?.sendNft?.status).toBe("success");
//       expect(updatedToken.migration?.depositNft?.status).toBe("success");
//       expect(updatedToken.migration?.lastStep).toBe("finalize");
//       expect(updatedToken.lockId).toBeDefined();
//       expect(updatedToken.nftMinted).toBeDefined();
//     }
//   });
// });
