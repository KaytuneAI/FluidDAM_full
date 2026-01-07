#!/bin/bash

# FluidDAM Production Startup Script for Ubuntu/Linux
# This script starts the API server using PM2 for production environment

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "Starting FluidDAM Production Services"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed. Please install npm first.${NC}"
    exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}[Warning] PM2 is not installed. Installing PM2 globally...${NC}"
    sudo npm install -g pm2
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to install PM2. Please install manually: sudo npm install -g pm2${NC}"
        exit 1
    fi
    echo -e "${GREEN}PM2 installed successfully${NC}"
    echo ""
fi

# Check if dependencies are installed
if [ ! -d "FluidDAM/node_modules" ]; then
    echo -e "${YELLOW}[Warning] FluidDAM dependencies not found, installing...${NC}"
    cd "$SCRIPT_DIR/FluidDAM"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}Error: Failed to install FluidDAM dependencies${NC}"
        exit 1
    fi
    cd "$SCRIPT_DIR"
    echo ""
fi

# Start API server with PM2
echo "Starting API Server (Port 3001) with PM2..."
cd "$SCRIPT_DIR/FluidDAM"

# Check if the server is already running
pm2 describe fluiddam-api > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${YELLOW}[Info] API server already running, restarting...${NC}"
    pm2 restart fluiddam-api
else
    echo -e "${GREEN}Starting new API server instance...${NC}"
    pm2 start server.js --name fluiddam-api
fi

# Save PM2 configuration
pm2 save

echo ""
echo "========================================"
echo -e "${GREEN}API Server started successfully!${NC}"
echo "========================================"
echo ""
echo "API Server Status:"
pm2 status fluiddam-api
echo ""
echo "API Server Logs:"
echo "  View logs: pm2 logs fluiddam-api"
echo "  View real-time logs: pm2 logs fluiddam-api --lines 50"
echo ""
echo "PM2 Commands:"
echo "  Status: pm2 status"
echo "  Restart: pm2 restart fluiddam-api"
echo "  Stop: pm2 stop fluiddam-api"
echo "  Delete: pm2 delete fluiddam-api"
echo ""
echo "API Endpoint: http://localhost:3001"
echo "  - Health check: http://localhost:3001/api/health"
echo "  - Jimeng AI: http://localhost:3001/api/jimeng-ai/generate"
echo ""
echo -e "${YELLOW}Note: Make sure Nginx is configured to proxy /api/ to http://127.0.0.1:3001/${NC}"
echo ""




