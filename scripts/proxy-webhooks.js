import ngrok from 'ngrok';
import dotenv from 'dotenv';
import url from 'node:url'; // To parse API URL

// Load environment variables
dotenv.config();

// --- Configuration ---
const LOCAL_API_URL = process.env.API_URL || 'http://localhost:8787'; // Default API URL
const NGROK_AUTH_TOKEN = process.env.NGROK_AUTH_TOKEN; // Optional ngrok auth token
// --- Helper Function ---
function getPortFromUrl(apiUrl) {
  try {
    const parsedUrl = new url.URL(apiUrl);
    return parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80);
  } catch (e) {
    console.error(`❌ Invalid API_URL format: ${apiUrl}. Could not extract port.`);
    process.exit(1);
  }
}

// --- Main Function ---
const startTunnel = async () => {
  const localPort = getPortFromUrl(LOCAL_API_URL);

  console.log(`🚇 Starting ngrok tunnel for local port ${localPort}...`);

  if (!NGROK_AUTH_TOKEN) {
    console.warn('⚠️ Ngrok auth token not found in environment variables (NGROK_AUTH_TOKEN). Using anonymous tunnel.');
  }

  try {
    const tunnelOptions = {
      proto: 'http',
      addr: localPort,
      authtoken: NGROK_AUTH_TOKEN || undefined, // Pass token if available
    };

    let publicUrl = await ngrok.connect(tunnelOptions);

    console.log('✅ ngrok tunnel established!');
    console.log(`🔗 Public URL: ${publicUrl}`);
    console.log(`👉 Forwarding to: ${LOCAL_API_URL}`);
    console.log('🔔 Configure this Public URL in your Helius and Codex webhook settings:');
    console.log(`   - Helius URL: ${publicUrl}/api/webhook`);
    console.log(`   - Codex URL:  ${publicUrl}/api/codex-webhook`);
    console.log('🔒 Remember to add the required Authorization header to your webhook configurations if needed.');
    console.log('⏳ Keeping tunnel alive. Press Ctrl+C to stop.');

    // Keep the script running
    process.stdin.resume();

  } catch (error) {
    console.error('❌ Failed to start ngrok tunnel:', error);
    process.exit(1);
  }
};

// --- Graceful Shutdown ---
process.on('SIGINT', async () => {
  console.log('👋 Shutting down ngrok tunnel...');
  try {
    await ngrok.disconnect(); // Disconnect all tunnels
    console.log('✅ ngrok tunnel disconnected.');
  } catch (error) {
    console.error('❌ Error disconnecting ngrok:', error);
  } finally {
    process.exit(0);
  }
});

// --- Run ---
startTunnel();
