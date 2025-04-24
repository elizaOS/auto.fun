import { Connection, PublicKey } from "@solana/web3.js";
import * as idlJson from "@autodotfun/types/idl/autofun.json";
import * as raydium_vault_IDL_JSON from "@autodotfun/types/idl/raydium_vault.json";
import { Autofun } from "@autodotfun/types/types/autofun";
import { RaydiumVault } from "@autodotfun/types/types/raydium_vault";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
const idl: Autofun = JSON.parse(JSON.stringify(idlJson));
import { TokenMigrator } from "./migrateToken";
import { getGlobalRedisCache } from "../redis";
import { Wallet } from "../tokenSupplyHelpers/customWallet";
const raydium_vault_IDL: RaydiumVault = JSON.parse(JSON.stringify(raydium_vault_IDL_JSON));
export async function resumeMigrationsOnStart(
): Promise<void> {
   const RPC_URL =
      process.env.NETWORK === "devnet"
         ? process.env.DEVNET_SOLANA_RPC_URL
         : process.env.MAINNET_SOLANA_RPC_URL;

   if (!RPC_URL || !process.env.PROGRAM_ID) {
      console.error("Missing RPC or PROGRAM_ID");
      process.exit(1);
   }

   const connection = new Connection(
      process.env.NETWORK === "devnet"
         ? process.env.DEVNET_SOLANA_RPC_URL!
         : process.env.MAINNET_SOLANA_RPC_URL!,
   );
   const wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY!)),
   );
   const provider = new AnchorProvider(
      connection,
      new Wallet(wallet),
      AnchorProvider.defaultOptions(),
   );
   const program = new Program<RaydiumVault>(
      raydium_vault_IDL as any,
      provider,
   );
   const autofunProgram = new Program<Autofun>(idl as any, provider);
   const redisCache = await getGlobalRedisCache();

   const tokenMigrator = new TokenMigrator(
      connection,
      new Wallet(wallet),
      program,
      autofunProgram,
      provider,
      redisCache
   );

   console.log("[Resume] Checking for in-flight migrations on startup…");
   await tokenMigrator.resumeMigrationsOnStart();
   console.log("[Resume] Done.");
}
