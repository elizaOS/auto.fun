import { Connection, PublicKey } from "@solana/web3.js";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const HELIUS_RPC_URL =
  process.env.VITE_SOLANA_NETWORK === "devnet"
    ? process.env.VITE_DEVNET_RPC_URL
    : process.env.VITE_MAINNET_RPC_URL;
const PROGRAM_ID = process.env.PROGRAM_ID;
const WEBHOOK_URL = `${process.env.VITE_API_URL}/api/webhook`;
const AUTH_TOKEN = process.env.HELIUS_WEBHOOK_AUTH_TOKEN;

if (!HELIUS_RPC_URL || !PROGRAM_ID || !AUTH_TOKEN) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const connection = new Connection(HELIUS_RPC_URL, "confirmed");

const mockWebhook = async (logs, signature) => {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: AUTH_TOKEN,
      },
      body: JSON.stringify([
        {
          meta: {
            logMessages: logs,
          },
          transaction: {
            signatures: [signature],
          },
        },
      ]),
    });

    if (!response.ok) {
      console.error("Failed to send webhook:", await response.text());
    } else {
      console.log("Successfully sent webhook for signature:", signature);
    }
  } catch (error) {
    console.error("Error sending webhook:", error);
  }
};

const main = async () => {
  console.log("🚀 Starting Helius webhook mock...");
  console.log("📡 Connecting to Helius RPC...");

  const programId = new PublicKey(PROGRAM_ID);

  // Subscribe to program logs
  const subscriptionId = connection.onLogs(
    programId,
    (logs) => {
      if (logs.err) {
        console.error("Error in transaction:", logs.err);
        return;
      }

      if (logs.logs && logs.logs.length > 0) {
        console.log("📝 Received logs for signature:", logs.signature);
        mockWebhook(logs.logs, logs.signature);
      }
    },
    "confirmed"
  );

  console.log("✅ Subscribed to program logs. Listening for transactions...");
  console.log("Press Ctrl+C to stop");

  // Handle cleanup on process exit
  process.on("SIGINT", async () => {
    console.log("\n👋 Shutting down...");
    await connection.removeOnLogsListener(subscriptionId);
    process.exit(0);
  });
};

main().catch(console.error);
