#!/bin/bash
set -e

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Setting up Auto.fun Docker Environment ===${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
  echo -e "${RED}Error: .env file not found!${NC}"
  echo -e "Please create a .env file with the required environment variables."
  echo -e "Make sure it includes the following variables:"
  echo -e "  - VITE_DEVNET_RPC_URL (with Helius API key)"
  echo -e "  - PROGRAM_ID"
  echo -e "  - HELIUS_WEBHOOK_AUTH_TOKEN"
  echo -e "  - HELIUS_API_KEY (for webhook registration)"
  exit 1
fi

# Check Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: Docker is not installed!${NC}"
  echo "Please install Docker before continuing."
  exit 1
fi

if ! command -v docker compose &> /dev/null; then
  echo -e "${RED}Error: Docker Compose is not installed!${NC}"
  echo "Please install Docker Compose before continuing."
  exit 1
fi

echo -e "${YELLOW}Webhook configuration:${NC}"
echo -e "  - Ensure HELIUS_API_KEY and HELIUS_WEBHOOK_AUTH_TOKEN are in your .env"
echo -e "  - The webhook tunnel will be exposed on port 8787"
echo -e "  - A localtunnel will be created to expose this port to the internet"
echo -e "  - The webhook URL will be registered with Helius automatically"

# Build the Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
docker compose build app

# Run the services
echo -e "${YELLOW}Starting services...${NC}"
docker compose up -d

echo -e "${GREEN}=== Auto.fun is now running! ===${NC}"
echo -e "The application should be available at: ${YELLOW}http://localhost:3000${NC}"
echo -e "Run ${YELLOW}docker compose logs -f app${NC} to view application logs"
echo -e "Run ${YELLOW}docker compose down${NC} to stop the services"
echo -e "\n${YELLOW}Webhook Information:${NC}"
echo -e "To check the webhook tunnel status, run: ${YELLOW}docker compose logs app | grep 'Tunnel created'${NC}"
echo -e "To view the webhook ID, run: ${YELLOW}docker compose logs app | grep 'Webhook ID'${NC}"