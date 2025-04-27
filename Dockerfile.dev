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
# Allow the ngrok postinstall script to run
RUN bun install

# Copy the application files
COPY . .

# Expose the port your app runs on
EXPOSE 3000
# For webhook tunnel
EXPOSE 8787

# Make scripts executable
RUN chmod +x scripts/*.js scripts/*.sh

# Set up environment variable for tunnel
ENV USE_TUNNEL=true

# Run the db sync script first, then setup webhook, then start the app
CMD ["sh", "-c", "scripts/sync-db-docker.sh && scripts/background-webhook.sh && bun run dev:docker"]