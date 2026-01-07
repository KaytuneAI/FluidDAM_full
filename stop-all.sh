#!/bin/bash

# FluidDAM Production Stop Script for Ubuntu/Linux
# This script stops the API server managed by PM2 for production environment

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "Stopping FluidDAM Production Services"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}[Warning] PM2 is not installed.${NC}"
    echo -e "${YELLOW}[Info] Trying to stop processes by port instead...${NC}"
    echo ""
    
    # Fallback: stop by port
    PORT=3001
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ -n "$PID" ]; then
        echo "Stopping process on port $PORT (PID: $PID)..."
        kill "$PID" 2>/dev/null
        sleep 1
        if lsof -ti:$PORT > /dev/null 2>&1; then
            kill -9 "$PID" 2>/dev/null
        fi
        echo -e "${GREEN}  ✓ Process stopped${NC}"
    else
        echo -e "${YELLOW}  - No process found on port $PORT${NC}"
    fi
    exit 0
fi

# Stop API server with PM2
echo "Stopping API Server (fluiddam-api) with PM2..."

# Check if the server is running
pm2 describe fluiddam-api > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "[INFO] Stopping fluiddam-api..."
    pm2 stop fluiddam-api
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}  ✓ API server stopped${NC}"
    else
        echo -e "${RED}  ✗ Failed to stop API server${NC}"
    fi
    
    # Ask if user wants to delete the PM2 process
    echo ""
    read -p "Do you want to delete the PM2 process? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pm2 delete fluiddam-api
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}  ✓ PM2 process deleted${NC}"
        else
            echo -e "${RED}  ✗ Failed to delete PM2 process${NC}"
        fi
    fi
    
    # Save PM2 configuration
    pm2 save
else
    echo -e "${YELLOW}  - API server (fluiddam-api) is not running in PM2${NC}"
    
    # Fallback: try to stop by port
    PORT=3001
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ -n "$PID" ]; then
        echo "[INFO] Found process on port $PORT (PID: $PID), stopping..."
        kill "$PID" 2>/dev/null
        sleep 1
        if lsof -ti:$PORT > /dev/null 2>&1; then
            kill -9 "$PID" 2>/dev/null
        fi
        echo -e "${GREEN}  ✓ Process on port $PORT stopped${NC}"
    fi
fi

echo ""
echo "========================================"
echo -e "${GREEN}Production services stopped!${NC}"
echo "========================================"
echo ""
echo "PM2 Status:"
pm2 status
echo ""
echo "To view PM2 logs: pm2 logs"
echo "To restart: pm2 restart fluiddam-api"
echo ""

