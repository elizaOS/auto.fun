#!/usr/bin/env node

/**
 * Cloudflare Cron Single Trigger
 *
 * This script triggers the Cloudflare Worker scheduled endpoint once.
 * Simplified version of cron-watcher.js for one-time execution.
 */

import fetch from "node-fetch";

// Configuration (can be overridden via command line args)
const DEFAULT_PORT = 8787; // default wrangler dev port
const port = parseInt(process.argv[2]) || DEFAULT_PORT;

// Local worker endpoint
const LOCAL_ENDPOINT = `http://127.0.0.1:${port}/_internal/trigger-cron`;
const CRON_PATTERN = "*/1 * * * *";

console.log("🕒 Cloudflare Cron Single Trigger");
console.log(`Endpoint: ${LOCAL_ENDPOINT}`);
console.log(`Cron pattern: ${CRON_PATTERN}`);

/**
 * Trigger the scheduled endpoint
 */
async function triggerCron() {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Triggering cron job...`);

    const response = await fetch(LOCAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": process.env.CRON_SECRET || "develop",
      },
      body: JSON.stringify({ cron: CRON_PATTERN }),
    });

    if (response.ok) {
      console.log(
        `[${timestamp}] ✅ Cron triggered successfully: ${response.status}`
      );
    } else {
      console.error(
        `[${timestamp}] ❌ Failed to trigger cron: ${response.status}`
      );
      const text = await response.text();
      console.error(
        `Response: ${text.substring(0, 200)}${text.length > 200 ? "..." : ""}`
      );
    }
  } catch (error) {
    console.error(`❌ Error triggering cron:`, error.message);
  }
}

/**
 * Run the cron once
 */
async function runOnce() {
  try {
    await triggerCron();
    console.log("✅ Cron trigger complete");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run once and exit
runOnce(); 