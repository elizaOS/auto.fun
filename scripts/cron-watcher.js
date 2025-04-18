#!/usr/bin/env node

/**
 * Cloudflare Cron Emulator
 *
 * This script emulates cron triggers for local Cloudflare Workers development.
 * It sends requests to the local Workers scheduled endpoint at configurable intervals.
 */

import { exec } from "child_process";
import fetch from "node-fetch";

// Configuration (can be overridden via command line args)
const DEFAULT_INTERVAL = 60; // seconds
const DEFAULT_ITERATIONS = 0; // 0 means run indefinitely
const DEFAULT_PORT = 8787; // default wrangler dev port

// Parse command line arguments
const args = process.argv.slice(2);
const interval = parseInt(args[0]) || DEFAULT_INTERVAL;
const iterations = parseInt(args[1]) || DEFAULT_ITERATIONS;
const port = parseInt(args[2]) || DEFAULT_PORT;

// Local worker endpoint
const LOCAL_ENDPOINT = `http://127.0.0.1:${port}/__scheduled`;
const CRON_PATTERN = "*/1 * * * *";

console.log("🕒 Cloudflare Cron Emulator");
console.log(`Interval: ${interval} seconds`);
console.log(`Iterations: ${iterations === 0 ? "infinite" : iterations}`);
console.log(`Endpoint: ${LOCAL_ENDPOINT}`);
console.log(`Cron pattern: ${CRON_PATTERN}`);
console.log("Press Ctrl+C to stop\n");

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
 * Run the cron emulator
 */
async function runEmulator() {
  // wait for 5 seconds
  await new Promise((resolve) => setTimeout(resolve, 5000));
  let count = 0;

  // Trigger immediately once
  await triggerCron();
  count++;

  if (iterations === 1) {
    console.log("Single iteration completed, exiting.");
    return;
  }

  // Set up interval for subsequent triggers
  const intervalId = setInterval(async () => {
    await triggerCron();
    count++;

    // Check if we've reached the desired number of iterations
    if (iterations > 0 && count >= iterations) {
      console.log(`\n✅ Completed ${iterations} iterations, exiting.`);
      clearInterval(intervalId);
    }
  }, interval * 1000);

  // Allow for clean exit
  process.on("SIGINT", () => {
    console.log("\n🛑 Cron emulator stopped by user");
    clearInterval(intervalId);
    process.exit(0);
  });
}

// Start the emulator
runEmulator().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
