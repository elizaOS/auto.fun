# Auto.fun + Serlaunchalot Protocol Backend

WIP
A decentralized token launch protocol implementing automated bonding curves with Raydium liquidity migration with AI Agents.

Built on Solana using Anchor framework.

## Overview

Ser Launchalot Protocol enables:

- Token launches with bonding curves
- Swap fees for team admin
- Automated migration to Raydium CP-Swap AMM
- Automatic LP token locking with Burn & Earn
- Real-time monitoring and analytics
- Multi-Threaded Vanity keypair generation ending in `ser`

### Technical Architecture

#### Smart Contract "Program"

- Handles pre-Raydium bonding curve and token creation/swaps
- Implements constant product formula (x * y = k)
- Manages token reserves in program-owned vault
- Handles swaps with swap fee collection
- Emits structured msg events for monitoring:
  - Swap: Tracks direction (buy/sell) and amount
  - SwapEvent: Tracks exact out amounts and prices
  - CompleteEvent: Signals curve completion
  - Fee: Fee tracking and collection

#### Backend

- Real-time program log monitoring
- Structured event parsing
- MongoDB state on-chain tracking
- Automated Raydium migration
- REST API endpoints for frontend

## Installation

### Prerequisites

- Linux/macOS environment
- Rust (latest)
- Solana CLI (latest)
- Anchor v0.30.1
- Node.js/Bun
- MongoDB

### Setup

1. Install Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

2. Install Solana:

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

3. Install Anchor:

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
```

4. Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

5. Install repo dependencies:

```bash
bun install
```

* Run `mongod` server locally or use remote

## Development

### Local Testing

1. Build program:

```bash
anchor build
```

2. Run program tests:

```bash
anchor test --provider.cluster localnet
```

### Devnet Deployment

1. Configure Anchor.toml:

```toml
[provider]
cluster = "https://api.devnet.solana.com"
wallet = "~/.config/solana/id.json"
```

2. Create .env file (use .env.example as example):

```
MONGODB_URI=mongodb://localhost:27017/launchalot
SOLANA_RPC_URL=https://api.devnet.solana.com
WALLET_KEYPAIR_PATH=/path/to/keypair.json
```

3. Build & Deploy program:

```bash
anchor build && anchor deploy
```

4. Start backend server:

```bash
bun run server.ts
```

## Usage Flow

1. Token Launch
2. Swap Execution
3. Migration Process (Bonding Curve Completed)

- Curve completion detection
- Token withdrawal
- Raydium pool creation
- LP token locking for "Burn & Earn" with NFT minted saved to database for tracking V3 fees


## Monitoring & Analytics

Backend provides REST API endpoints:

- `/new_token`: Create a new token (Via Twitter Bot)
    POST request to create a new token
    e.g. `http://localhost:3069/new_token` with data 
    ```
    { "name": "Ser Launchalot", "symbol": "SLOT", "uri": "https://ipfs.io/ipfs/Qm...", "xusername": "serlaunchalot", "xurl": "https://x.com/serlaunchalot/89fsda8hf9fsad", "xavatarurl": "https://x.com/serlaunchalot/img.png" }
    ```

- `/tokens`: List all tokens
    ```
    // Basic Pagination
    GET /tokens?limit=50
    GET /tokens?limit=50&cursor=lastTokenId

    // Text Search
    GET /tokens?search=solana        // Searches name, ticker, mint, description
    GET /tokens?search=sol&limit=20  // With pagination

    // Status Filter
    GET /tokens?status=active
    GET /tokens?status=migrated

    // Creator Filter
    GET /tokens?creator=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

    // Sorting
    GET /tokens?sortBy=createdAt&sortOrder=desc
    GET /tokens?sortBy=reserveAmount&sortOrder=desc

    // Combined Filters
    GET /tokens?status=active&sortBy=reserveAmount&limit=20
    GET /tokens?search=sol&creator=ADDRESS&status=active&limit=50

    // Market Cap Sort
    GET /tokens?sortBy=marketCapUSD&sortOrder=desc
    ```
- `/tokens/:mint`: Token details
- `/tokens/:mint/holders`: Get token holders with pagination
    ```
    // Basic pagination
    GET /tokens/:mint/holders?limit=50
    GET /tokens/:mint/holders?cursor=lastHolderId

    // Sorting
    GET /tokens/:mint/holders?sortBy=amount&sortOrder=desc
    GET /tokens/:mint/holders?sortBy=percentage&sortOrder=desc

    // Search by address
    GET /tokens/:mint/holders?search=Gh9ZwEm

    // Combined
    GET /tokens/:mint/holders?search=Gh9ZwEm&sortBy=amount&limit=20
    ```
- `/swaps/:mint`: Token-specific swaps data (charting)
   ```
    // First page
    GET /swaps/mintAddress?limit=50

    // Next page
    GET /swaps/mintAddress?limit=50&cursor=lastSwapId

    // With time range
    GET /swaps/mintAddress?limit=50&startTime=2024-03-01&endTime=2024-03-02
   ```
- `/fees`: Fee collection data
- `/chart/:pairIndex/:start/:end/:range/:token`: Formatted OHLCV charting data for TradingView Charts frontend
- `/register`: Register a new user
    POST request to register a new user
    e.g. `http://localhost:3069/register` with data `{ "name": "John Doe", "avatar": "https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq", "address": "3fdsafdsaweSFfd..." }`  

    Returns the JWT token for further requests: `Authorization: Bearer <token>`
    ```
    {
    "user": {
        "address": "BoeEDSULDSF1s81XCtmsgWPZmgLjiF1PyDFub2j8Wtsz",
        "avatar": "https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq",
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
    ```
- `/avatar/:address`: Get user avatar
- `/messages`: Get all messages
- `/messages/:tokenMint`: Get messages by token
- `/new-msg`: Create a new message
    POST request to create a new message
    e.g. `http://localhost:3069/new-msg` with data `{ "author": "3fdsafdsaweSFfd...", "tokenMint": "3fdsafdsaweSFfd...", "message": "Hello, world!" }`  
- `/vanity-keypair`: Get an unused vanity keypair ending in `ser` (For token launching)
    POST request to create a new vanity keypair
    e.g. `http://localhost:3069/vanity-keypair` with data `{ "address": "3fdsafdsaweSFfd..." }`  

- `/agents`: Get all agents
- `/agents/:id`: Get an agent by id
- `/agents/claim`: Claim an agent
- `/agents/cleanup-stale`: Cleanup stale agents
- `/agents/:id/force-release`: Force release an agent
- POST `/agents`: Create a new agent
- `/verify`: Verify a Twitter account

- WIP on further endpoints needed for frontend

Default Port `3069` for Backend/API/Socket.io events and endpoints: `http://localhost:3069/`

## Technical Details

### Bonding Curve Implementation

- Constant product formula
- Virtual reserves for initial pricing
- Fee calculation and collection
- Slippage protection

### Program Event Monitoring

Program emits structured logs:

```
Mint: {token_mint}
Swap: {user} {direction} {amount}
SwapEvent: {user} {direction} {amountOut}
NewToken: {token_name} {token_symbol} {token_uri} {token_mint} {creator_mint} {reserve_amount} {decimals}
Reserves: {reserve_token} {reserve_lamport}
Fee: {fee_amount}
```

### Database Schema

```typescript
// Reference to schemas.ts
```

## Security Considerations

- Slippage protection
- Fee validation
- Reserve boundary checks
- LP token locking (Raydium CP-Swap AMM Burn & Earn)
- Transaction signing validation
- Zod Validation on schemas and endpoints
- JWT for API endpoint authentication

## Contributing

1. Fork repository
2. Create feature branch or work off of `v3`
3. Commit changes
4. Open pull request

# Examples and Notes

## Socket.io

The backend server runs a socket.io server on port 3069, which is used to emit new swap and charting data to the frontend.

Test locally with devnet and backend with the `test.html` do a swap with it running to see the data in browser.

It emits the following events:

- `newToken` (Global)
- `newCandle` (Token-specific)
- `newSwap` (Token-specific)
- `updateToken` (Token-specific)

### Example GET `/chart/` TradingView Charting Data Endpoint:

Example GET `/chart/:pairIndex/:start/:end/:range/:token` TradingView Charting Data Endpoint:
`http://localhost:3069/chart/0/1710000000/1811000000/60/DsdojZoG2biLpswAwv2pfkTqAnbxniv4So7eeHSsSWfj`

Example output:
```
{
  "table": [
    {
      "open": 0.242659280144063,
      "high": 0.242659280144063,
      "low": 0.000289977839835484,
      "close": 0.000341383002284279,
      "time": 1733958000
    },
    {
      "open": 0.000341383002284279,
      "high": 0.000396857740731266,
      "low": 0.000341383002284279,
      "close": 0.000396857740731266,
      "time": 1733961600
    },
    {
      "open": 0.000396857740731266,
      "high": 0.000396857740731266,
      "low": 0.000396857740731266,
      "close": 0.000396857740731266,
      "time": 1733979600
    }
  ]
}
```

### Deployment Notes for Program

- Build program with `anchor build`
- Configure `.env` with proper values
- Deploy program with `anchor deploy`
- Update and re-build/re-deploy program with updated `Anchor.toml` and `lib.rs` with proper address declaration
- Configure the program with on program call configure() (Setups fees and bonding curve spec) `bun script config`
- Start backend `bun run server.ts`
- Example token launching with `bun script launch` or `bun run bot.ts` (For Token creation bot for testing)

# MongoDB Schema

See `schemas.ts` for the MongoDB schema.

We utilize `users`, `tokens`, `swaps`, `fees`, and `messages` collections.
