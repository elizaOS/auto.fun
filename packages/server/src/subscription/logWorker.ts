// src/workers/logWorker.ts
import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
import { startLogSubscription } from "./subscription";

dotenv.config({ path: "../../../.env" });

const RPC_URL =
   process.env.NETWORK === "devnet"
      ? process.env.DEVNET_SOLANA_RPC_URL
      : process.env.MAINNET_SOLANA_RPC_URL;

if (!RPC_URL || !process.env.PROGRAM_ID) {
   console.error("Missing RPC or PROGRAM_ID");
   process.exit(1);
}

const connection = new Connection(RPC_URL, "confirmed");
const programId = new PublicKey(process.env.PROGRAM_ID);

const env = process.env;

startLogSubscription(connection, programId, env);
