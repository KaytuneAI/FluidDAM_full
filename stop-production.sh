#!/bin/bash

# FluidDAM Production Server - Stop Script for Ubuntu/Linux/Mac
# This script stops all running production services

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "Stopping FluidDAM Production Server"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to stop process by port
stop_by_port() {
    local port=$1
    local name=$2
    
    # Find process using the port
    local pid=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pid" ]; then
        echo "[INFO] Stopping $name on port $port (PID: $pid)..."
        kill "$pid" 2>/dev/null
        sleep 1
        # Force kill if still running
        if lsof -ti:$port > /dev/null 2>&1; then
            kill -9 "$pid" 2>/dev/null
            sleep 1
        fi
        if lsof -ti:$port > /dev/null 2>&1; then
            echo -e "${RED}  ✗ Failed to stop $name${NC}"
        else
            echo -e "${GREEN}  ✓ $name stopped${NC}"
        fi
    else
        echo -e "${YELLOW}  - No process found on port $port ($name)${NC}"
    fi
}

# Function to stop process by PID file
stop_by_pid_file() {
    local name=$1
    local pid_file="logs/${name}-prod.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "[INFO] Stopping $name (PID: $pid)..."
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

# ========================================
# Stop Node.js API Server
# ========================================
echo "[1/2] Stopping Node.js API Server..."
stop_by_pid_file "unified-api-server"
stop_by_port "3001" "API Server"

# Also kill any remaining node processes related to the API server
pkill -f "npm run server" 2>/dev/null
pkill -f "node.*server.js" 2>/dev/null

echo ""

# ========================================
# Stop Nginx
# ========================================
echo "[2/2] Stopping Nginx..."

# Check if nginx is running
if command -v nginx &> /dev/null; then
    # Try graceful shutdown first
    if [ -f "/var/run/nginx.pid" ]; then
        NGINX_PID=$(cat /var/run/nginx.pid)
        if ps -p "$NGINX_PID" > /dev/null 2>&1; then
            echo "[INFO] Sending QUIT signal to Nginx (PID: $NGINX_PID)..."
            nginx -s quit 2>/dev/null
            sleep 2
        fi
    fi
    
    # Check if nginx is still running
    if pgrep -x nginx > /dev/null; then
        echo "[INFO] Force killing Nginx processes..."
        pkill -9 nginx 2>/dev/null
        sleep 1
    fi
    
    # Verify nginx is stopped
    if pgrep -x nginx > /dev/null; then
        echo -e "${RED}  ✗ Failed to stop Nginx${NC}"
    else
        echo -e "${GREEN}  ✓ Nginx stopped${NC}"
        # Clean up PID file if exists
        rm -f /var/run/nginx.pid 2>/dev/null
        rm -f "$SCRIPT_DIR/logs/nginx.pid" 2>/dev/null
    fi
else
    echo -e "${YELLOW}  - Nginx not found in PATH${NC}"
    # Try to kill any nginx processes anyway
    pkill -9 nginx 2>/dev/null
fi

echo ""

# Clean up any remaining related processes
echo "Cleaning up any remaining processes..."
pkill -f "node.*FluidDAM.*server" 2>/dev/null

# Wait a moment
sleep 1

echo ""
echo "========================================"
echo -e "${GREEN}All production services stopped!${NC}"
echo "========================================"
echo ""

