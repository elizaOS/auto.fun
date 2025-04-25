import fetch from "node-fetch";
import localtunnel from "localtunnel";
import dotenv from "dotenv-flow";

// Load environment variables
dotenv.config();

const extractHeliusApiKey = (url) => {
  try {
    const apiKeyMatch = url.match(/api-key=([^&]+)/);
    return apiKeyMatch ? apiKeyMatch[1] : null;
  } catch (error) {
    return null;
  }
};

// Fetch all webhooks for the account
const fetchWebhooks = async (apiKey) => {
  console.log("🔍 Checking for existing webhooks...");

  const response = await fetch(
    `https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`,
    {
      method: "GET",
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch webhooks: ${response.statusText}`);
  }

  return response.json();
};

// Get the webhook configuration
const getWebhookConfig = (webhookUrl) => ({
  webhookURL: webhookUrl,
  transactionTypes: ["ANY"],
  txnStatus: "success",
  accountAddresses: [process.env.PROGRAM_ID],
  webhookType: "rawDevnet",
  authHeader: process.env.HELIUS_WEBHOOK_AUTH_TOKEN,
});

// Create a new webhook
const createWebhook = async (apiKey, webhookUrl) => {
  console.log("🆕 Creating new webhook...");

  const response = await fetch(
    `https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getWebhookConfig(webhookUrl)),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to create webhook: ${JSON.stringify(data)}`);
  }

  console.log("✅ Webhook created successfully!");
  return data;
};

// Update an existing webhook
const updateWebhook = async (apiKey, webhookId, webhookUrl) => {
  console.log(`🔄 Updating existing webhook (ID: ${webhookId})...`);

  const response = await fetch(
    `https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getWebhookConfig(webhookUrl)),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to update webhook: ${JSON.stringify(data)}`);
  }

  console.log("✅ Webhook updated successfully!");
  return data;
};

// Start a localtunnel
const startTunnel = async (port) => {
  console.log("🌐 Starting tunnel...");

  try {
    const tunnel = await localtunnel({ port });
    console.log(`✅ Tunnel started at ${tunnel.url}`);

    // Set up event handlers
    tunnel.on("error", (err) => {
      console.error("❌ Tunnel error:", err);
    });

    tunnel.on("close", () => {
      console.log("Tunnel closed");
    });

    return tunnel;
  } catch (error) {
    throw new Error(`Failed to start tunnel: ${error.message}`);
  }
};

const setupHeliusWebhook = async () => {
  console.log("🚀 Setting up Helius webhook...");

  // Extract Helius API key from existing RPC URL
  const rpcUrl =
    process.env.VITE_SOLANA_NETWORK === "devnet"
      ? process.env.VITE_DEVNET_RPC_URL
      : process.env.VITE_MAINNET_RPC_URL;
  const heliusApiKey = extractHeliusApiKey(rpcUrl);

  if (!heliusApiKey) {
    console.error(
      "❌ Could not extract Helius API key from VITE_DEVNET_RPC_URL"
    );
    console.error(
      "Please ensure your .env file contains a valid Helius RPC URL"
    );
    process.exit(1);
  }

  console.log("✅ Found Helius API key");

  let tunnel;
  try {
    // Start the tunnel
    tunnel = await startTunnel(8787);
    const webhookUrl = `${tunnel.url}/api/webhook`;

    // Get existing webhooks
    const webhooks = await fetchWebhooks(heliusApiKey);
    const existingWebhook = webhooks.length > 0 ? webhooks[0] : null;

    // Create or update webhook
    let data;
    if (existingWebhook) {
      data = await updateWebhook(
        heliusApiKey,
        existingWebhook.webhookID,
        webhookUrl
      );
    } else {
      data = await createWebhook(heliusApiKey, webhookUrl);
    }

    console.log(`Webhook ID: ${data.webhookID}`);
    console.log(
      "🎉 Setup complete! The tunnel will remain active for development."
    );
    console.log("Press Ctrl+C to stop the tunnel when you're done.");
  } catch (error) {
    console.error("❌ Error setting up webhook:", error.message);
    if (tunnel) tunnel.close();
    process.exit(1);
  }

  // Keep the process running to maintain the tunnel
  process.on("SIGINT", () => {
    console.log("Shutting down tunnel...");
    if (tunnel) tunnel.close();
    process.exit(0);
  });
};

setupHeliusWebhook();
