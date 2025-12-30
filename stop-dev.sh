#!/bin/bash

# FluidDAM Unified Entry Application - Stop Script for Ubuntu/Linux
# This script stops all running development services

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "Stopping all FluidDAM applications..."
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to stop process by PID file
stop_by_pid_file() {
    local name=$1
    local pid_file="logs/${name}-dev.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "Stopping $name (PID: $pid)..."
            kill "$pid" 2>/dev/null
            sleep 1
            # Force kill if still running
            if ps -p "$pid" > /dev/null 2>&1; then
                kill -9 "$pid" 2>/dev/null
            fi
            echo -e "${GREEN}  ✓ $name stopped${NC}"
        else
            echo -e "${YELLOW}  - $name was not running${NC}"
        fi
        rm -f "$pid_file"
    else
        echo -e "${YELLOW}  - PID file not found for $name${NC}"
    fi
}

# Function to stop process by port
stop_by_port() {
    local port=$1
    local name=$2
    
    # Find process using the port
    local pid=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pid" ]; then
        echo "Stopping process on port $port ($name)..."
        kill "$pid" 2>/dev/null
        sleep 1
        # Force kill if still running
        if lsof -ti:$port > /dev/null 2>&1; then
            kill -9 "$pid" 2>/dev/null
        fi
        echo -e "${GREEN}  ✓ Port $port freed${NC}"
    else
        echo -e "${YELLOW}  - No process found on port $port${NC}"
    fi
}

# Stop services by PID files (preferred method)
stop_by_pid_file "unified-api-server"
stop_by_pid_file "banner_gen"
stop_by_pid_file "fluiddam"
stop_by_pid_file "unified-entry"

echo ""

# Also try to stop by port (fallback method)
stop_by_port "3000" "Unified Entry"
stop_by_port "3001" "Unified API Server"
stop_by_port "5173" "Banner_gen"
stop_by_port "5174" "FluidDAM (SpotStudio)"

# Kill any remaining node processes related to npm
echo ""
echo "Cleaning up any remaining npm/node processes..."
pkill -f "npm run dev" 2>/dev/null
pkill -f "npm run server" 2>/dev/null
pkill -f "vite" 2>/dev/null

# Wait a moment
sleep 1

echo ""
echo "========================================"
echo -e "${GREEN}All applications stopped!${NC}"
echo "========================================"
echo ""

