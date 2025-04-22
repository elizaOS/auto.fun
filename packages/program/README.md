# Auto.Fun Program

## Overview

Auto.Fun is a Solana-based program designed to facilitate token launches and manage bonding curves. This project leverages the Anchor framework for Solana smart contract development. Additionally, it integrates with the Raydium Vault for enhanced liquidity management.

## Features

- **Token Launch**: Initialize and launch new tokens with specified metadata and supply.
- **Bonding Curve Management**: Manage token bonding curves with configurable parameters.
- **Authority Management**: Nominate and accept new authorities for program governance.
- **Raydium Vault Integration**: Utilize Raydium Vault for liquidity provision and management.

## Prerequisites

- [Node.js](https://nodejs.org/) (version 14 or later)
- [Yarn](https://yarnpkg.com/)
- [Rust](https://www.rust-lang.org/tools/install) (with nightly toolchain)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)

## Setup

1. **Clone the Repository**

   ```bash
   git clone https://github.com/yourusername/auto.fun.git
   cd auto.fun/program
   ```

2. **Install Dependencies**

   ```bash
   yarn install
   ```

3. **Configure Environment**

   - Copy `.env.example` to `.env` and fill in the necessary environment variables.

4. **Build the Program**

   ```bash
   yarn build
   ```

5. **Deploy the Program**

   - For Devnet:

     ```bash
     yarn deploy:autofun_dev
     yarn deploy:vault_dev
     ```

   - For Mainnet:

     ```bash
     yarn deploy:autofun_main
     yarn deploy:vault_main
     ```

## Usage

### Initialize Auto.Fun & Raydium Vault

To initialize the `autofun` and `raydium_vault` programs, use the `initAutofun.ts` and `initRayVault.ts` script:

- For Devnet:

  ```bash
  yarn init:autofun_dev
  yarn init:vault_dev
  ```

- For Mainnet:

  ```bash
  yarn init:autofun_main
  yarn init:vault_main
  ```

### Verify Your Initialization

It is *recommended* to check your initialization after using the `checkConfig.ts` script:

- For Devnet:

  ```bash
  yarn check_config:dev
  ```

- For Mainnet:

  ```bash
  yarn check_config:main
  ```

### Launch a Token

To launch a token, use the `launchToken.ts` script:

```bash
yarn launch:dev
```

### Manage Raydium Vault

To interact with the Raydium Vault, use the provided scripts:

- **Change Vault Executor**:

  ```bash
  yarn changeVaultExec:dev
  ```

### Run Tests

To run the test suite, execute:

```bash
yarn test:dev
```

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request for any improvements or bug fixes.
