#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Default local database connection URL (matches docker-compose.yml and db.ts fallback)
DEFAULT_DATABASE_URL="postgresql://autofun_owner:npg_2PDZgJfEtrh6@localhost:5432/autofun"

# Check if DATABASE_URL is set and not empty
if [ -z "${DATABASE_URL}" ]; then
  echo "DATABASE_URL not set. Using default local Docker database URL."
  export DATABASE_URL=$DEFAULT_DATABASE_URL
else
  echo "Using DATABASE_URL from environment."
fi

# Ensure the PostgreSQL container is running (simple check)
if ! docker ps | grep -q autofun-postgres; then
  echo "Error: PostgreSQL container (autofun-postgres) does not appear to be running."
  echo "Please start it using: docker-compose up -d postgres"
  exit 1
fi

# Navigate to the server package
cd packages/server

# Generate migrations based on schema changes
echo "Running drizzle-kit generate..."
drizzle-kit generate

# Apply migrations to the database
echo "Running drizzle-kit push..."
drizzle-kit push

echo "Database sync (generate & push) complete."
