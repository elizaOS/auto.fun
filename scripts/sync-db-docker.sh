#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Default database connection URL inside Docker
DEFAULT_DATABASE_URL="postgresql://autofun_owner:npg_2PDZgJfEtrh6@postgres:5432/autofun"

# Check if DATABASE_URL is set and not empty
if [ -z "${DATABASE_URL}" ]; then
  echo "DATABASE_URL not set. Using default Docker database URL."
  export DATABASE_URL=$DEFAULT_DATABASE_URL
else
  echo "Using DATABASE_URL from environment: ${DATABASE_URL}"

  # If running inside Docker, replace localhost with postgres
  if [ -f "/.dockerenv" ]; then
    export DATABASE_URL=$(echo $DATABASE_URL | sed 's/localhost:5432/postgres:5432/g' | sed 's/127.0.0.1:5432/postgres:5432/g')
    echo "Modified DATABASE_URL for Docker: $DATABASE_URL"
  fi
fi

# Test database connection
echo "Testing database connection..."
if command -v pg_isready >/dev/null 2>&1; then
  DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\).*/\1/p')
  if [ -z "$DB_HOST" ]; then
    DB_HOST="postgres" # Default if parsing fails
  fi
  
  if pg_isready -h $DB_HOST; then
    echo "Database connection to $DB_HOST successful!"
  else
    echo "Warning: Database connection test failed! DB_HOST=$DB_HOST"
    echo "Database URL format: $DATABASE_URL"
    echo "Will still try to proceed with migrations..."
  fi
else
  echo "pg_isready not available, skipping connection test"
fi

# Navigate to the server package
cd packages/server

# Generate migrations based on schema changes
echo "Running drizzle-kit generate..."
set +e  # Don't exit on error for these commands
bun drizzle-kit generate
GEN_RESULT=$?
if [ $GEN_RESULT -ne 0 ]; then
  echo "Warning: drizzle-kit generate failed with exit code $GEN_RESULT"
else
  echo "Successfully generated migrations"
fi

# Apply migrations to the database
echo "Running drizzle-kit push..."
bun drizzle-kit push
PUSH_RESULT=$?
if [ $PUSH_RESULT -ne 0 ]; then
  echo "Warning: drizzle-kit push failed with exit code $PUSH_RESULT"
else
  echo "Successfully applied migrations to database"
fi

# Overall status
if [ $GEN_RESULT -eq 0 ] && [ $PUSH_RESULT -eq 0 ]; then
  echo "Database sync (generate & push) completed successfully."
  exit 0
else
  echo "Database sync completed with warnings."
  exit 1
fi
