# Local Deployment Guide

This guide explains how to set up and run Auto.fun locally using Docker.

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
| `NGROK_AUTH_TOKEN` | Auth token for ngrok (if using ngrok for tunneling) | `your_ngrok_token` |

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
- Builds the Docker image
- Starts all services
- Sets up webhook tunneling automatically

### Option 2: Manual Docker Compose

If you prefer to run commands manually:

1. Build the Docker image:
   ```bash
   docker compose build app
   ```

2. Start all services:
   ```bash
   docker compose up -d
   ```

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

The application uses Drizzle for database migrations, which are handled automatically:

1. When the application starts, the `sync-db-docker.sh` script runs:
   - It checks the database connection
   - Generates migrations based on schema changes using `drizzle-kit generate`
   - Applies migrations to the database using `drizzle-kit push`

2. You can manually run migrations with:
   ```bash
   docker compose exec app bash -c "cd packages/server && bun drizzle-kit push"
   ```

## MinIO Configuration

The application uses MinIO for object storage:

1. The docker-vite.config.js includes a proxy configuration that forwards `/minio` requests to the MinIO container
2. You can access the MinIO console at [http://localhost:9001](http://localhost:9001)
3. Default credentials: `minio_user` / `minio_password`

## Webhooks

The application uses webhooks for real-time event handling. There are two webhook tunneling options available:

### Option 1: Localtunnel (Default in Docker)

The default setup in Docker uses localtunnel via `setup-webhook-docker.js`:

1. A tunnel is automatically created to expose port 8787 to the internet
2. The webhook URL is registered with Helius using your API key
3. You can check the webhook status with:
   ```bash
   docker compose logs app | grep 'Tunnel created'
   docker compose logs app | grep 'Webhook ID'
   ```

### Option 2: Ngrok

Alternatively, you can use ngrok via `proxy-webhooks.js`:

1. Ensure you have the `NGROK_AUTH_TOKEN` in your `.env` file (optional but recommended)
2. Running this script manually creates a tunnel and provides URLs for both:
   - Helius webhooks: `[ngrok-url]/api/webhook`
   - Codex webhooks: `[ngrok-url]/api/codex-webhook`

### Webhook Verification

To verify webhooks are working correctly:

1. Check the application logs for successful webhook registration:
   ```bash
   docker compose logs app | grep 'Webhook registered successfully'
   ```

2. Verify incoming webhook events:
   ```bash
   docker compose logs app | grep 'Received webhook event'
   ```

## Custom Domain Setup

If you want to use your own domain instead of tunneling, you'll need to:

1. **Set up a reverse proxy** (like Nginx) to expose your API to the internet:

   ```bash
   # Example Nginx configuration
   server {
       listen 80;
       server_name api.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:8787;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

2. **Configure DNS** to point your domain to your server's IP address

3. **Update your environment variables**:
   ```
   WEBHOOK_PUBLIC_URL=https://api.yourdomain.com
   ```

4. **Consider using SSL** (via Let's Encrypt) for secure connections

## Troubleshooting

1. **Database Connection Issues**
   - Ensure PostgreSQL container is running: `docker compose ps`
   - Check database logs: `docker compose logs postgres`

2. **Redis Connection Issues**
   - Verify Redis container is running: `docker compose ps`
   - Check Redis logs: `docker compose logs redis`

3. **MinIO Connection Issues**
   - Confirm MinIO container is running: `docker compose ps`
   - Access MinIO console at [http://localhost:9001](http://localhost:9001)
   - Default credentials: `minio_user` / `minio_password`

4. **Webhook Issues**
   - Ensure `HELIUS_API_KEY` and `HELIUS_WEBHOOK_AUTH_TOKEN` are set in your `.env`
   - Check app logs for tunnel and webhook registration information 
   - If using a custom domain, verify that your domain is correctly pointed to your server
   - Test webhook connectivity by making a manual request to your webhook URL