# Development Environment Setup

## Infrastructure Services

This application uses the following infrastructure services:

- **PostgreSQL**: Main database for the application
- **Redis**: In-memory data store used for caching and message queuing
- **MinIO**: S3-compatible object storage for file storage

## Local Development Setup

### 1. Environment Configuration

Create a `.env.local` file in the root directory with the following content:

```
# Database connection
DATABASE_URL=postgresql://autofun_owner:npg_2PDZgJfEtrh6@localhost:5432/autofun
# Redis connection
REDIS_HOST="localhost"
REDIS_PORT=6379
REDIS_PASSWORD="MDikUKnhRHlURlnORexvVztDTrNCUBze"
# MinIO S3 connection
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minio_user
S3_SECRET_KEY=minio_password
```

### 2. Docker Services

We use Docker Compose to run all the required infrastructure services locally.

Start the services:

```bash
docker-compose up --build
```

Stop the services and remove volumes (clean start):

```bash
docker-compose down -v
```

### 3. Service Access

- PostgreSQL: Available at `localhost:5432`
- Redis: Available at `localhost:6379`
- MinIO:
  - API endpoint: `localhost:9000`
  - Web console: `localhost:9001`