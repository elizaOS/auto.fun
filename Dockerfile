FROM oven/bun:1.2.4

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Create necessary package directories
RUN mkdir -p packages/autodoc packages/charts packages/client packages/docs \
    packages/program packages/raydium packages/server packages/types packages/udf

# First, copy only package.json and lock files needed for dependency installation
COPY package.json bun.lock ./
COPY packages/client/package.json ./packages/client/
COPY packages/program/package.json ./packages/program/
COPY packages/raydium/package.json ./packages/raydium/
COPY packages/server/package.json ./packages/server/
COPY packages/types/package.json ./packages/types/

# Install dependencies
RUN bun install --ignore-scripts

# Copy the application files
COPY . .

# Create placeholder for proxy-webhooks.js if it doesn't exist or is empty
RUN if [ ! -s scripts/proxy-webhooks.js ]; then \
    echo 'console.log("Proxy webhook script is not implemented. Using environment webhook URL.");' > scripts/proxy-webhooks.js; \
    fi

# Expose the port your app runs on
EXPOSE 3000
# For webhook tunnel
EXPOSE 8787

# Make scripts executable
RUN chmod +x scripts/*.js scripts/*.sh

# Set up environment variable for tunnel
ENV USE_TUNNEL=true
# WEBHOOK_PUBLIC_URL will be set by docker-compose env_file or tunnel script
# ENV WEBHOOK_PUBLIC_URL=http://localhost:8787

# Run the db sync script first, then the dev:docker command (env vars loaded by docker-compose)
CMD ["sh", "-c", "scripts/sync-db-docker.sh && bun run dev:docker"]