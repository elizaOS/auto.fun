#!/bin/bash

# Ensure scripts directory exists
mkdir -p scripts

# Function to check if a port is open
is_port_open() {
  nc -z localhost $1 > /dev/null 2>&1
}

# Function to check if a docker container exists and is running
is_container_running() {
    docker ps -q --filter name=^/$1$ --filter status=running | grep -q .
}

# Function to check if a docker container exists (any status)
does_container_exist() {
    docker ps -aq --filter name=^/$1$ | grep -q .
}


# --- Configuration ---
POSTGRES_PORT=5432
POSTGRES_CONTAINER_NAME="dev-postgres"
# Use a default password; consider sourcing from .env for better security
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-mysecretpassword}"

REDIS_PORT=6379
REDIS_CONTAINER_NAME="dev-redis"

# --- Cleanup Function ---
cleanup() {
    echo "Received exit signal. Cleaning up development containers..."
    stopped_containers=0

    if does_container_exist $POSTGRES_CONTAINER_NAME; then
        echo "Stopping PostgreSQL container ($POSTGRES_CONTAINER_NAME)..."
        docker stop $POSTGRES_CONTAINER_NAME > /dev/null && \
        echo "Removing PostgreSQL container ($POSTGRES_CONTAINER_NAME)..." && \
        docker rm $POSTGRES_CONTAINER_NAME > /dev/null && \
        stopped_containers=$((stopped_containers + 1))
    fi

    if does_container_exist $REDIS_CONTAINER_NAME; then
        echo "Stopping Redis container ($REDIS_CONTAINER_NAME)..."
        docker stop $REDIS_CONTAINER_NAME > /dev/null && \
        echo "Removing Redis container ($REDIS_CONTAINER_NAME)..." && \
        docker rm $REDIS_CONTAINER_NAME > /dev/null && \
        stopped_containers=$((stopped_containers + 1))
    fi

    if [ $stopped_containers -gt 0 ]; then
        echo "Cleanup finished."
    else
        echo "No managed containers found to clean up."
    fi
    # Exit with the original signal or 0 if no signal was trapped initially
    exit ${exit_status:-0}
}

# --- Trap Exit Signals ---
# Store the exit status of the command that triggered the trap
trap 'exit_status=$?; cleanup' SIGINT SIGTERM EXIT

# --- Check and Start Postgres ---
if is_port_open $POSTGRES_PORT; then
  echo "Port $POSTGRES_PORT is already in use. Assuming PostgreSQL is running."
elif is_container_running $POSTGRES_CONTAINER_NAME; then
   echo "PostgreSQL container '$POSTGRES_CONTAINER_NAME' is already running."
else
  echo "PostgreSQL not found or container stopped. Starting Docker container '$POSTGRES_CONTAINER_NAME'..."
  # Remove existing container if it exists but isn't running
  if does_container_exist $POSTGRES_CONTAINER_NAME; then
    echo "Removing stopped container '$POSTGRES_CONTAINER_NAME'..."
    docker rm $POSTGRES_CONTAINER_NAME > /dev/null
  fi
  docker run --name $POSTGRES_CONTAINER_NAME \\
    -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \\
    -p $POSTGRES_PORT:5432 \\
    -d postgres:latest > /dev/null

  echo "Waiting for PostgreSQL container to start..."
  # Simple wait loop
  for i in {1..10}; do
    if is_port_open $POSTGRES_PORT; then
      echo "PostgreSQL container '$POSTGRES_CONTAINER_NAME' started successfully."
      break
    fi
    sleep 1
  done

  if ! is_port_open $POSTGRES_PORT; then
      echo "ERROR: Failed to start PostgreSQL container '$POSTGRES_CONTAINER_NAME' or port $POSTGRES_PORT not accessible."
      docker logs $POSTGRES_CONTAINER_NAME
      exit 1
  fi
fi

# --- Check and Start Redis ---
if is_port_open $REDIS_PORT; then
  echo "Port $REDIS_PORT is already in use. Assuming Redis is running."
elif is_container_running $REDIS_CONTAINER_NAME; then
    echo "Redis container '$REDIS_CONTAINER_NAME' is already running."
else
  echo "Redis not found or container stopped. Starting Docker container '$REDIS_CONTAINER_NAME'..."
   # Remove existing container if it exists but isn't running
  if does_container_exist $REDIS_CONTAINER_NAME; then
    echo "Removing stopped container '$REDIS_CONTAINER_NAME'..."
    docker rm $REDIS_CONTAINER_NAME > /dev/null
  fi
  docker run --name $REDIS_CONTAINER_NAME \\
    -p $REDIS_PORT:6379 \\
    -d redis:latest > /dev/null

  echo "Waiting for Redis container to start..."
  for i in {1..5}; do
    if is_port_open $REDIS_PORT; then
      echo "Redis container '$REDIS_CONTAINER_NAME' started successfully."
      break
    fi
    sleep 1
  done

  if ! is_port_open $REDIS_PORT; then
      echo "ERROR: Failed to start Redis container '$REDIS_CONTAINER_NAME' or port $REDIS_PORT not accessible."
      docker logs $REDIS_CONTAINER_NAME
      exit 1
  fi
fi

# --- Execute Original Command ---
echo "-------------------------------------"
echo "Starting main development process..."
echo "Executing: $@"
echo "-------------------------------------"
# Use exec to replace the shell process with the command, ensuring signals are passed correctly
exec "$@" 