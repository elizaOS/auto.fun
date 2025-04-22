---
sidebar_position: 2
---

# Installation

This guide will help you set up your development environment for Auto.fun.

## Prerequisites

Before you begin, make sure you have the following installed:

- Node.js (v16 or higher)
- bun
- Git

## Step 1: Clone the Repository

```bash
git clone https://github.com/auto.fun/auto.fun.git
cd auto.fun
```

## Step 2: Install Dependencies

```bash
bun install
# or
yarn install
```

## Step 3: Configure Environment Variables

Copy the example environment file and add your specific values:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```
# API Keys
HELIUS_API_KEY=your_helius_api_key

# Other Configuration
NEXT_PUBLIC_API_URL=https://api.auto.fun
```

## Step 4: Build the Project

```bash
bun run build
# or
yarn build
```

## Step 5: Start Development Server

```bash
bun run dev
# or
yarn dev
```

## Step 6: Configure Webhooks (Optional)

By default, we will mock the webhook events using a web socket server. If you want to test with real webhooks in development:

1. Create your own Helius account at https://dashboard.helius.dev
2. Modify the dev script in package.json to call setup-webhook.js
3. Run `bun run dev` to automatically tunnel your local server and add it as a webhook to Helius

## Next Steps

Now that you have set up your environment, check out the [Quick Start](./quickstart) guide to create your first token. 