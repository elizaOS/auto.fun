# Launch and Swap Functionality

This document explains how to use the new `launch_and_swap` instruction that allows token creators to launch a token and immediately perform an initial swap in a single transaction.

## Overview

The normal workflow for launching a token and performing an initial buy would require two separate transactions:

1. Call `launch` to create the token and set up the bonding curve
2. Wait for transaction confirmation on-chain
3. Call `swap` to perform the initial buy

The new `launch_and_swap` instruction combines these two steps into a single atomic transaction, which:

- Creates a new token
- Sets up the bonding curve
- Allows the creator to swap SOL for the newly created token in the same transaction
- Doesn't require waiting for the first transaction to confirm

## Usage

### On-chain Instruction

To use this functionality in your Rust code or tests, call the `launch_and_swap` instruction:

```rust
program.methods
  .launch_and_swap(
    // Launch parameters
    decimals,
    token_supply,
    virtual_lamport_reserves,
    name,
    symbol,
    uri,
    // Swap parameters
    swap_amount,
    minimum_receive_amount,
    deadline
  )
  .accounts({
    teamWallet: config_account.team_wallet,
    creator: creator.public_key,
    token: token_keypair.public_key,
    // Other accounts will be resolved by Anchor
  })
  .signers([creator, token_keypair])
  .rpc();
```

### Client-side Helper

There's also a client-side helper function in `lib/scripts.ts`:

```typescript
import { launchAndSwapTx } from "../lib/scripts";

// Use the helper to create the transaction
const tx = await launchAndSwapTx(
  creator.publicKey,
  9, // decimals
  1_000_000_000_000, // token supply (1,000,000 tokens with 9 decimals)
  1_000_000_000, // virtual lamport reserves (1 SOL)
  "Token Name",
  "SYMBOL",
  "https://token-metadata-uri.com",
  100_000_000, // swap amount (0.1 SOL)
  200, // slippage basis points (2%)
  connection,
  program
);

// Sign and send the transaction
await sendAndConfirmTransaction(connection, tx, [creator, tokenKeypair]);
```

## Implementation Details

The `launch_and_swap` instruction:

1. Validates all input parameters
2. Creates the token and sets up the bonding curve
3. Performs the swap operation using the same bonding curve logic as the standalone swap instruction
4. Returns the amount of tokens received from the swap

The internal implementation separates the logic into two functions, `process_launch` and `process_swap`, which are called sequentially but atomically within a single transaction.

## Benefits

- Improved UX by allowing users to launch and perform initial swap in one step
- Reduced chance of frontrunning (no gap between token launch and initial buy)
- Lower overall transaction fees compared to making two separate transactions
- More atomic process that either fully succeeds or fully fails

## Limitations

- The swap amount must come from the same wallet that is creating the token
- Must be carefully tracked in monitoring systems that look for token creation events 