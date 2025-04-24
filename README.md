# Auto.fun

Press the fun button. Auto.fun is a platform featuring a Solana-based program for launching tokens with bonding curves, integrated with Raydium for liquidity, a backend server, and a web frontend.

![post](https://github.com/user-attachments/assets/b21a3ede-ae4d-4e0d-be8e-2eeac18f5778)

## Key Features

*   **Token Launch & Bonding Curves:** Deploy new Solana tokens with automated market making via bonding curves.
*   **Raydium Integration:** Utilizes Raydium Vaults for managing liquidity.
*   **Event-Driven Updates:** Leverages Helius webhooks for real-time on-chain event processing.
*   **AI Integration:** Uses FAL for image generation and News API for event information.
*   **Monorepo Structure:** Organized codebase using TurboRepo and Bun workspaces.
*   **Local Development Environment:** Uses Docker Compose for easy setup of PostgreSQL, Redis, and MinIO.

## Packages

This monorepo contains the following packages:

*   `packages/autodoc`: Automatic repository documentation generation.
*   `packages/charts`: Charting views for token data (potentially consolidated with `udf`).
*   `packages/client`: The Vite + React frontend application.
*   `packages/docs`: Project documentation.
*   `packages/program`: Solana programs (Anchor framework) for the core Auto.fun logic and Raydium Vault interactions.
*   `packages/server`: The Hono backend server handling API requests, authentication, and off-chain logic.
*   `packages/types`: Shared TypeScript types, constants, and IDLs across the frontend, server, and program interactions.
*   `packages/udf`: UDF-compatible data feed for charting libraries (potentially consolidated with `charts`).

## Technology Stack

*   **Frontend:** React, Vite, TypeScript, TailwindCSS
*   **Backend:** Hono, TypeScript, Node.js
*   **Blockchain:** Solana, Anchor, Raydium
*   **Database:** PostgreSQL (via Drizzle ORM)
*   **Cache/Queue:** Redis
*   **Storage:** MinIO (S3 compatible)
*   **Build/Repo:** Bun, TurboRepo
*   **Infrastructure:** Docker

## Prerequisites

*   **Bun:** Follow the installation guide at [https://bun.sh/docs/installation](https://bun.sh/docs/installation).
*   **Docker & Docker Compose:** Install from [https://www.docker.com/get-started](https://www.docker.com/get-started).
*   **Solana CLI:** Follow the installation guide at [https://docs.solana.com/cli/install-solana-cli-tools](https://docs.solana.com/cli/install-solana-cli-tools).
*   **Rust & Anchor:** Required for program development. Follow Anchor installation guide: [https://www.anchor-lang.com/docs/installation](https://www.anchor-lang.com/docs/installation). Ensure you use the `nightly-2025-04-14` toolchain as specified in `packages/program/package.json`. Check `packages/program/package.json` for the specific `@coral-xyz/anchor` version dependency (e.g., `"0.30.1"`).
    ```bash
    rustup install nightly-2025-04-14
    rustup default nightly-2025-04-14
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
    avm install latest
    avm use latest
    ```
*   **API Keys:**
    *   Helius API Key: [https://helius.dev/](https://helius.dev/) (For Solana RPC access and Webhooks)
    *   Codex API Key: (Obtain access as needed - For data/intelligence features)
    *   FAL API Key: [https://fal.ai/](https://fal.ai/) (For AI-based image generation)
    *   News API Key: [https://newsapi.org/](https://newsapi.org/) (For fetching real-time events/news)

## Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone <your-repo-url>
    cd autofun-monorepo
    ```

2.  **Configure Environment Variables**
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   Edit the `.env` file and fill in *all* the required values. See the "Environment Variables" section below for details.

3.  **Install Dependencies**
    ```bash
    bun install
    ```

4.  **Start Local Infrastructure (PostgreSQL, Redis, MinIO)**
    *   This project uses Docker Compose to manage required infrastructure services locally:
        *   **PostgreSQL:** Main application database.
        *   **Redis:** Caching and message queuing.
        *   **MinIO:** S3-compatible object storage.
    *   Ensure Docker Desktop is running.
    *   Start the services in detached mode:
        ```bash
        docker-compose up -d --build
        ```
    *   To stop the services and remove associated volumes (for a clean start):
        ```bash
        docker-compose down -v
        ```
    *   **Service Access:**
        *   PostgreSQL: `localhost:5432` (Connect using credentials from `.env`)
        *   Redis: `localhost:6379` (Connect using credentials from `.env`)
        *   MinIO API: `http://localhost:9000`
        *   MinIO Console: `http://localhost:9001` (Use `minio_user` / `minio_password` from `.env` to log in)

5.  **Run Database Migrations**
    *   Once the PostgreSQL container is running, apply database migrations:
    ```bash
    bun run migrate
    ```

6.  **Build the Project** (Optional, `bun run dev` often handles this)
    ```bash
    bun run build
    ```

## Running Locally

1.  **Start Development Servers**
    *   This command starts the frontend, backend server, and potentially the proxy webhook server (see step 2). It also copies the root `.env` to `packages/server/.env`.
        ```bash
        bun run dev
        ```
    *   The frontend will typically be available at `http://localhost:5173` (or the port specified by Vite).
    *   The backend server will run on the port specified in its configuration (often 3000 or 8787 via wrangler).

2.  **Configure Helius Webhooks (for Real Events)**
    *   The default `bun run dev` command may use a proxy webhook server (`proxy-webhooks.js`).
    *   To use real Helius webhooks for development:
        *   Modify the `dev` script in the root `package.json` to run `setup-webhook.js` instead of `proxy-webhooks.js`.
        *   Ensure your `HELIUS_API_KEY` is correctly set in your `.env` file.
        *   Run `bun run dev`. This will:
            *   Use `localtunnel` to expose your local server via a public HTTPS URL.
            *   Automatically register this public URL as a webhook endpoint with Helius using your API key.
    *   **Note:** Webhook registration might take a minute to propagate in Helius. Try to minimize server restarts when using this method.

## Environment Variables (`.env`)

Fill in the following variables in your root `.env` file:

**Core Solana & Program:**

*   `VITE_SOLANA_NETWORK`: Set to `devnet` or `mainnet-beta`.
*   `VITE_DEVNET_RPC_URL`: RPC URL for Solana Devnet (e.g., from Helius, QuickNode, Alchemy).
*   `VITE_MAINNET_RPC_URL`: RPC URL for Solana Mainnet Beta.
*   `VITE_DEV_PROGRAM_ID`: The deployed program ID for the `autofun` program on Devnet.
*   `VITE_PROGRAM_ID`: The deployed program ID for the `autofun` program on Mainnet Beta.
*   `VITE_VIRTUAL_RESERVES`: Initial SOL reserves for the bonding curve (used on client, ensure consistency with program deployment). Devnet uses 1/10th the value of mainnet.
*   `VITE_TOKEN_SUPPLY`: Total initial supply for launched tokens (used on client).
*   `VITE_DECIMALS`: Token decimals (usually 9 for SPL tokens).

**API Keys:**

*   `HELIUS_API_KEY`: Your Helius API key for RPC and webhooks.
*   `CODEX_API_KEY`: Your Codex API key.
*   `FAL_API_KEY`: Your FAL API key for image generation.
*   `NEWS_API_KEY`: Your News API key for fetching news events.

**Backend / Server:**

*   `DATABASE_URL`: PostgreSQL connection string (should match `docker-compose.yml` for local dev).
    *   Format: `postgresql://<user>:<password>@<host>:<port>/<database>`
    *   Local Default: `postgresql://autofun_owner:npg_2PDZgJfEtrh6@localhost:5432/autofun`
*   `REDIS_HOST`: Redis host (e.g., `localhost`).
*   `REDIS_PORT`: Redis port (e.g., `6379`).
*   `REDIS_PASSWORD`: Redis password.
*   `AUTH_TOKEN_SALT`: A secret string used for signing JWT authentication tokens. Generate a strong random string.

**Storage (MinIO/S3):**

*   `S3_STORAGE_ENDPOINT`: URL for the S3-compatible storage endpoint (MinIO for local dev).
    *   Local Default: `http://localhost:9000`
*   `S3_ACCESS_KEY`: Access key for the S3 service.
    *   Local Default: `minio_user`
*   `S3_SECRET_KEY`: Secret key for the S3 service.
    *   Local Default: `minio_password`
*   `VITE_S3_PUBLIC_URL` or `VITE_R2_PUBLIC_URL`: The public-facing base URL for accessing files in storage (used by the client).
    *   Local Default: `http://localhost:9000/<your-bucket-name>` (You'll need to create a bucket in MinIO via its console at `http://localhost:9001`).
*   `VITE_METADATA_BASE_URL`: Base URL where token metadata JSON files are served.
*   `VITE_IMAGE_OPTIMIZATION_URL`: URL for an image optimization service, if used.

**Frontend:**

*   `VITE_API_URL`: The base URL for the production backend API.
*   `VITE_DEV_API_URL`: The base URL for the development backend API (can be the same as `VITE_API_URL` or point to your local server, e.g., `http://localhost:8787`).

**Other:**

*   `VITE_ADMIN_ADDRESSES`: Comma-separated list of Solana wallet addresses that have admin privileges in the frontend.

## Usage

*   **Local Development:** Access the frontend via its localhost URL (e.g., `http://localhost:5173`). Interact with the application to test features.
*   **Solana Program:** Use the scripts defined in `packages/program/package.json`. You can run these from the root directory using `bun run <script_name> --filter=@autodotfun/program` or by navigating to `cd packages/program` and running `anchor run <script_name>`. Refer to `packages/program/README.md` for program-specific details. Remember the bonding curve parameters differ between devnet and mainnet.
*   **Testing:** Run tests across all packages: `bun run test`
*   **Linting:** Check code style and quality: `bun run lint`

## Key Monorepo Commands

*   `bun run dev`: Starts development servers for all packages.
*   `bun run build`: Builds all packages.
*   `bun run test`: Runs tests in all packages.
*   `bun run lint`: Lints all packages.
*   `bun run migrate`: Runs database migrations (uses the server package).
*   `bun run clean`: Removes build artifacts and `node_modules`.

## Deployment

*   **Target:** The project is currently deployed to Railway.
*   **CI/CD:** There is no automated CI/CD pipeline set up currently.
*   **Frontend:** The `packages/client` is a standard Vite React app and can be deployed to platforms like Vercel, Netlify, Cloudflare Pages, or GitHub Pages. Build with `bun run build:client`.
*   **Backend:** The `packages/server` is a Hono application designed potentially for Cloudflare Workers but runnable as a Node.js server. It can be deployed to platforms like Railway, Fly.io, or traditional servers/VPS. It requires PostgreSQL and Redis databases. Build with `bun run build:server` and start with `bun run start:server`.
*   **Environment Variables:** Ensure all necessary environment variables (from the `.env` file) are correctly configured in your deployment environment(s).

## Documentation

Further documentation can be found at [https://elizaos.github.io/auto.fun](https://elizaos.github.io/auto.fun) (Work in Progress).

## Contributing

Contributions are welcome! Please follow standard Git workflow:

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/your-feature-name`).
3.  Make your changes.
4.  Commit your changes (`git commit -m 'Add some feature'`).
5.  Push to the branch (`git push origin feature/your-feature-name`).
6.  Open a Pull Request.

