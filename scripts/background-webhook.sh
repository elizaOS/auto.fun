#!/bin/bash
# Start the webhook tunnel in the background
node scripts/setup-webhook.js &
WEBHOOK_PID=$!

# Wait briefly to ensure the tunnel is established
sleep 5

# Log that we're continuing execution
echo "Webhook tunnel started in background (PID: $WEBHOOK_PID), continuing with application..."

# Return success to continue with next command
exit 0