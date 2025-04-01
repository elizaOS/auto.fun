# AutoFun - Solana Program

AutoFun is a powerful Solana program built with Anchor that enables automated token creation and management through innovative bonding curve mechanics and virtual liquidity reserves.

## Prerequisites

Before you can deploy and configure the AutoFun program, ensure you have the following installed:

- [Rust](https://www.rust-lang.org/tools/install) (1.70.0 or later)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (1.16.0 or later)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) (0.30.1 or later)
- [Node.js](https://nodejs.org/) (18.x or later)
- [Bun](https://bun.sh/) (1.2.5 or later)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/auto.fun.git
   cd auto.fun
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Set up your Solana keypair if you don't have one already:
   ```bash
   solana-keygen new
   ```

4. Update the Anchor.toml file with your wallet path:
   ```toml
   [provider]
   cluster = "https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY"
   wallet = "/path/to/your/keypair.json"
   ```

## Deployment

### Building the Program

1. Build the program:
   ```bash
   cd program
   anchor build
   ```

2. Get the program ID:
   ```bash
   solana address -k target/deploy/autofun-keypair.json
   ```

3. Update the program ID in the following files:
   - `program/autofun/src/lib.rs` - Update the `declare_id!()` macro
   - `program/Anchor.toml` - Update the program ID in the `[programs]` section

4. Build again after updating the program ID:
   ```bash
   anchor build
   ```

### Deploying to Devnet

1. Ensure you have SOL in your wallet on devnet:
   ```bash
   solana airdrop 2 --url devnet
   ```

2. Deploy the program:
   ```bash
   anchor deploy --provider.cluster devnet
   ```

### Deploying to Mainnet

1. Make sure you have sufficient SOL in your wallet on mainnet:
   ```bash
   solana balance --url mainnet-beta
   ```

2. Deploy to mainnet:
   ```bash
   anchor deploy --provider.cluster mainnet-beta
   ```

## Configuration

After deployment, you need to initialize the program by calling the `configure` method:

### Configuration Parameters

The `Config` structure has the following important fields:

- `authority`: The public key of the admin account
- `team_wallet`: The wallet to receive fees and agent distributions
- `init_bonding_curve`: The bonding curve initialization percentage
- `platform_buy_fee`: Fee percentage for buy operations (in basis points)
- `platform_sell_fee`: Fee percentage for sell operations (in basis points)
- `curve_limit`: Maximum lamports to complete the bonding curve
- `lamport_amount_config`: Configuration for lamport amounts in range or enum format
- `token_supply_config`: Configuration for token supply in range or enum format
- `token_decimals_config`: Configuration for token decimals in range or enum format

These are typically defined in the `.env` vars

### Devnet:
```
VITE_VIRTUAL_RESERVES=2800000000 # 2.8 SOL
VIRTUAL_RESERVES=2800000000 # 2.8 SOL
CURVE_LIMIT=11300000000 # 11.3 SOL
# ...and others for fees etc.
```
### Mainnet:
```
VITE_VIRTUAL_RESERVES=28000000000 # 28 SOL
VIRTUAL_RESERVES=28000000000 # 28 SOL
CURVE_LIMIT=11300000000 # 113 SOL
# ...and others for fees etc.
```

### Using the CLI (with TypeScript)

Create a TypeScript file to initialize the program configuration:

```typescript
// configure.ts
import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { Autofun } from './types/autofun'; // Your generated types

async function main() {
  // Connection to Solana cluster
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Set up the wallet
  const wallet = new anchor.Wallet(Keypair.fromSecretKey(
    // Load your keypair
    Uint8Array.from(JSON.parse(require('fs').readFileSync('/path/to/keypair.json', 'utf-8')))
  ));
  
  // Set up provider
  const provider = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: 'confirmed',
  });
  
  // Load the program
  const programId = new PublicKey('aUToHWG2U3E33oDyKm68pwUygDE1sUUGUM1mnLppMVQ');
  const program = new Program<Autofun>(
    require('./target/idl/autofun.json'),
    programId,
    provider
  );
  
  // Create the configuration object
  const config = {
    authority: wallet.publicKey,
    pendingAuthority: wallet.publicKey,
    teamWallet: new PublicKey('YOUR_TEAM_WALLET_ADDRESS'),
    initBondingCurve: 0.8, // 80%
    platformBuyFee: new anchor.BN(300), // 3% in basis points
    platformSellFee: new anchor.BN(300), // 3% in basis points
    curveLimit: new anchor.BN(1000 * anchor.web3.LAMPORTS_PER_SOL), // 1000 SOL
    lamportAmountConfig: {
      range: {
        min: new anchor.BN(0.01 * anchor.web3.LAMPORTS_PER_SOL), // 0.01 SOL minimum
        max: new anchor.BN(100 * anchor.web3.LAMPORTS_PER_SOL), // 100 SOL maximum
      }
    },
    tokenSupplyConfig: {
      range: {
        min: new anchor.BN(1000000), // Minimum token supply
        max: new anchor.BN(1000000000), // Maximum token supply
      }
    },
    tokenDecimalsConfig: {
      enum: [6, 9], // Allowed token decimal values
    },
  };
  
  // Find the config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [anchor.utils.bytes.utf8.encode('config')],
    program.programId
  );
  
  // Call the configure instruction
  try {
    const tx = await program.methods
      .configure(config)
      .accounts({
        config: configPda,
        authority: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    
    console.log('Configuration successful. Transaction:', tx);
  } catch (error) {
    console.error('Error configuring the program:', error);
  }
}

main();
```

Run the configuration script:

```bash
ts-node configure.ts
```

### Launching a Token

After configuring the program, you can launch a token using the `launch` or `launchAndSwap` methods:

```typescript
// launch.ts
async function launchToken() {
  // ... (Setup code similar to configure.ts)
  
  // Token parameters
  const decimals = 9;
  const tokenSupply = new anchor.BN(1000000000); // 1 billion tokens
  const virtualLamportReserves = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL); // 10 SOL virtual reserves
  const name = "My Token";
  const symbol = "MTK";
  const uri = "https://example.com/metadata.json";
  
  // Get PDAs and find necessary accounts
  // ... (Code to find PDAs and create necessary keypairs)
  
  // Launch the token
  try {
    const tx = await program.methods
      .launch(
        decimals,
        tokenSupply,
        virtualLamportReserves,
        name,
        symbol,
        uri
      )
      .accounts({
        // Specify all required accounts
        // ...
      })
      .rpc();
    
    console.log('Token launch successful. Transaction:', tx);
  } catch (error) {
    console.error('Error launching token:', error);
  }
}

launchToken();
```

## Admin Operations

### Transferring Ownership

The program uses a two-step process for transferring ownership:

1. Current authority nominates a new authority:
   ```typescript
   await program.methods
     .nominateAuthority(newAuthorityPublicKey)
     .accounts({
       config: configPda,
       authority: wallet.publicKey,
     })
     .rpc();
   ```

2. New authority accepts the nomination:
   ```typescript
   // Run by the new authority
   await program.methods
     .acceptAuthority()
     .accounts({
       config: configPda,
       authority: newAuthorityPublicKey,
     })
     .rpc();
   ```

### Withdrawing Funds

The admin can withdraw tokens and SOL from the program:

```typescript
await program.methods
  .withdraw()
  .accounts({
    config: configPda,
    authority: wallet.publicKey,
    // Specify other required accounts
  })
  .rpc();
```

## Common Issues and Troubleshooting

- **Insufficient Balance**: Ensure your wallet has enough SOL for deployment and transactions.
- **Program ID Mismatch**: Double-check that you've updated the program ID in all required locations.
- **Permission Denied**: Only the authority can perform admin operations.
