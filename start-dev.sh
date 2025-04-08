#!/bin/bash

# Ensure the script exits on any error
set -e

# Print some debug information
echo "Setting up Rust environment for development..."
echo "Before PATH modification:"
which rustc

# Add Rustup's bin directory to the beginning of PATH
export PATH="$HOME/.cargo/bin:$PATH"

echo "After PATH modification:"
which rustc

# Verify WebAssembly target
echo "Checking for WebAssembly target..."
rustc --print target-list | grep wasm32-unknown-unknown

# Create the missing cron-watcher.js file if needed
SCRIPT_DIR="scripts"
CRON_WATCHER="$SCRIPT_DIR/cron-watcher.js"

if [ ! -d "$SCRIPT_DIR" ]; then
  echo "Creating scripts directory..."
  mkdir -p "$SCRIPT_DIR"
fi

if [ ! -f "$CRON_WATCHER" ]; then
  echo "Creating placeholder cron-watcher.js..."
  cat > "$CRON_WATCHER" << 'EOF'
// This is a placeholder cron watcher
console.log('Cron watcher is running...');

// Keep process alive
setInterval(() => {
  console.log('Cron watcher still active: ' + new Date().toISOString());
}, 60000);
EOF
fi

# Create or update .env.local with API URL
echo "Creating .env.local with required environment variables..."
cat > .env.local << 'EOF'
# Client environment variables
VITE_API_URL=http://localhost:8787
VITE_DEV_API_URL=http://localhost:8787
EOF

# Finally, run the dev command
echo "Starting development server..."
bun run dev 