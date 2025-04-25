# Local Docker Deployment Guide

This guide explains how to set up and run the entire Auto.fun stack locally using Docker.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed
- Git repository cloned locally
- Basic understanding of terminal/command line

## Environment Setup

1. Create a `.env` file in the root directory by copying the provided example:

```bash
cp example.txt .env
```

2. Update the following key environment variables in your `.env` file:

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret for JWT token generation | `your_secure_random_string` |
| `HELIUS_API_KEY` | API key from Helius (for Solana RPC access) | `your_helius_api_key` |
| `HELIUS_WEBHOOK_AUTH_TOKEN` | Auth token for Helius webhooks | `your_webhook_token` |
| `WALLET_PRIVATE_KEY` | Your wallet private key (for testing only) | `[...]` |
| `PROGRAM_ID` | The Solana program ID | `autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5` |
| `VITE_DEVNET_RPC_URL` | Helius RPC URL for devnet (with API key) | `https://devnet.helius-rpc.com/?api-key=your_key` |
| `VITE_MAINNET_RPC_URL` | Helius RPC URL for mainnet (with API key) | `https://mainnet.helius-rpc.com/?api-key=your_key` |
| `NGROK_AUTH_TOKEN` | Auth token for ngrok (Only needed if *manually* using ngrok instead of the default localtunnel) | `your_ngrok_token` |

> **Important:** The `.env` file contains sensitive information. Never commit it to version control.

### Database and Storage

Local development uses Docker containers for:
- PostgreSQL database
- Redis cache
- MinIO (S3-compatible object storage)

The Docker environment variables are pre-configured for local development in the `docker-compose.yml` file.

## Running the Application

### Option 1: Using the Convenience Script

For the easiest setup, use the provided script:

```bash
bash scripts/run-docker.sh
```

This script:
- Checks for the `.env` file and required scripts
- Verifies Docker and Docker Compose installation
- Builds the Docker image (`app` service)
- Starts all services defined in `docker-compose.yml`
- Sets up webhook tunneling automatically using `localtunnel`

### Option 2: Manual Docker Compose

If you prefer to run commands manually:

1. Build the Docker image:
   ```bash
   docker compose build
   ```
   *(This builds the image for the `app` service defined in `Dockerfile`)*

2. Start all services:
   ```bash
   docker compose up -d
   ```
   *(This starts the `app`, `postgres`, `redis`, and `minio` services)*

3. View logs (optional):
   ```bash
   docker compose logs -f app
   ```

4. Stop all services when done:
   ```bash
   docker compose down
   ```

## Accessing the Application

Once running, the application is available at:
- Frontend: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8787](http://localhost:8787)

## Service Information

| Service | Description | Internal Port | External Port |
|---------|-------------|--------------|--------------|
| app | Main application | 3000, 8787 | 3000, 8787 |
| postgres | PostgreSQL database | 5432 | 5432 |
| redis | Redis cache | 6379 | 6379 |
| minio | MinIO object storage | 9000, 9001 | 9000, 9001 |

## Database Migrations

The application uses Drizzle for database migrations, which are handled automatically within the Docker container:

1. When the `app` container starts, the `scripts/sync-db-docker.sh` script runs automatically (as specified in the `Dockerfile`'s `CMD`).
2. This script:
   - Tests the database connection.
   - Generates new migration files if schema changes are detected (`drizzle-kit generate`).
   - Applies pending migrations to the database (`drizzle-kit push`).

3. You can observe this process in the container logs:
   ```bash
   docker compose logs app | grep 'Running drizzle-kit'
   docker compose logs app | grep 'Database sync'
   ```

4. If needed, you can manually trigger the migration process within a running container:
   ```bash
   docker compose exec app bash scripts/sync-db-docker.sh
   ```
   *(Note: Running `drizzle-kit push` directly inside might bypass connection logic in the script).*

## MinIO Configuration

The application uses MinIO for S3-compatible object storage:

1. The `docker-compose.yml` sets up the `minio` service.
2. You can access the MinIO console at [http://localhost:9001](http://localhost:9001)
3. Default credentials (from `docker-compose.yml`): `minio_user` / `minio_password`
4. The `vite.config.ts` in `packages/client` likely includes proxy settings to forward requests from the frontend to the MinIO container (check the config for details, typically `/minio` or similar).

## Webhooks (Localtunnel)

The Docker setup automatically configures webhook tunneling using **localtunnel** for development:

1. When the `app` container starts, the `scripts/background-webhook.sh` script runs (part of the `CMD` in `Dockerfile`).
2. This background script executes `scripts/setup-webhook.js`.
3. `setup-webhook.js`:
   - Starts a `localtunnel` instance, exposing the container's port `8787` to a public URL.
   - Retrieves your Helius API key from the `.env` file (via `VITE_DEVNET_RPC_URL` or `VITE_MAINNET_RPC_URL`).
   - Checks for existing Helius webhooks associated with your API key.
   - Creates a new Helius webhook or updates an existing one to point to the `localtunnel` URL (`[tunnel-url]/api/webhook`).

### Verifying Webhooks

1. Check the application logs for tunnel creation and webhook registration details:
   ```bash
   # Look for the tunnel URL
   docker compose logs app | grep 'Tunnel started at'

   # Look for webhook creation/update success
   docker compose logs app | grep 'Webhook registered successfully' # Check setup-webhook.js for exact log message
   docker compose logs app | grep 'Webhook created successfully'
   docker compose logs app | grep 'Webhook updated successfully'
   docker compose logs app | grep 'Webhook ID'
   ```

2. Verify incoming webhook events by interacting with your application (triggering Solana transactions) and checking logs:
   ```bash
   docker compose logs app | grep 'Received webhook event' # Check server code for exact log message
   ```

## Custom Domain Setup

If you want to use your own domain instead of the automatic `localtunnel`, you'll need to:

1. **Set up a reverse proxy** (like Nginx or Caddy) on a publicly accessible server to forward traffic to your local machine's port `8787`. This requires careful network configuration (firewalls, port forwarding).
   ```nginx
   # Example Nginx configuration snippet
   server {
       listen 443 ssl; # Use SSL (Let's Encrypt)
       server_name api.yourdomain.com;

       # SSL cert configuration...

       location / {
           proxy_pass http://YOUR_LOCAL_IP:8787; # Forward to your dev machine
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

2. **Configure DNS** to point `api.yourdomain.com` to your public server's IP address.

3. **Update your `.env` file**:
   ```dotenv
   WEBHOOK_PUBLIC_URL=https://api.yourdomain.com
   # You might need to disable the default tunnel if it conflicts
   # USE_TUNNEL=false # Check if this env var is used in scripts/Dockerfile
   ```

4. **Manually register the webhook** with Helius using your public URL (`https://api.yourdomain.com/api/webhook`), potentially using the Helius dashboard or API directly. The automatic setup in `setup-webhook.js` will likely need to be disabled or modified if you use a custom domain.

## Troubleshooting

1. **Container Start Issues**
   - Check Dockerfile `CMD`: `sh -c "scripts/sync-db-docker.sh && scripts/background-webhook.sh && bun run dev:docker"`
   - Check logs for errors during `sync-db-docker.sh` or `background-webhook.sh`: `docker compose logs app`
   - Ensure base image `oven/bun:1.2.4` is pulled correctly.

2. **Database Connection Issues (`app` service)**
   - Verify `postgres` container is running and healthy: `docker compose ps`
   - Check `postgres` logs: `docker compose logs postgres`
   - Check `app` logs for connection errors related to `DATABASE_URL=postgres://autofun_owner:npg_2PDZgJfEtrh6@postgres:5432/autofun`.
   - Ensure `app` service `depends_on: postgres: condition: service_healthy` is working.

3. **Redis Connection Issues (`app` service)**
   - Verify `redis` container is running and healthy: `docker compose ps`
   - Check `redis` logs: `docker compose logs redis`
   - Check `app` logs for connection errors related to `REDIS_HOST=redis`, `REDIS_PORT=6379`.
   - Ensure `app` service `depends_on: redis: condition: service_healthy` is working.

4. **MinIO Connection Issues (`app` service or Frontend)**
   - Verify `minio` container is running and healthy: `docker compose ps`
   - Check `minio` logs: `docker compose logs minio`
   - Access MinIO console: [http://localhost:9001](http://localhost:9001) (Credentials: `minio_user` / `minio_password`). Ensure the `autofun` bucket exists (it should be created automatically if the application handles it, otherwise create it manually).
   - Check `app` logs for S3 client errors.
   - Ensure `app` service `depends_on: minio: condition: service_healthy` is working.
   - Verify frontend proxy settings (if applicable) in `packages/client/vite.config.ts`.

5. **Webhook Issues (Localtunnel)**
   - Ensure `HELIUS_API_KEY` (extracted from RPC URL) and `HELIUS_WEBHOOK_AUTH_TOKEN` are correctly set in `.env` and accessible by `setup-webhook.js`.
   - Check `app` logs (`docker compose logs app`) for errors from `setup-webhook.js` (tunnel creation, API calls to Helius).
   - Verify the `localtunnel` process is still running within the container.
   - Check Helius dashboard to see if the webhook is registered and points to the correct tunnel URL. 