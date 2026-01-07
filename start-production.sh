#!/bin/bash

# FluidDAM Production Server - Startup Script for Ubuntu/Linux/Mac
# This script starts all required services for production

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "Starting FluidDAM Production Server"
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

# Configuration
NODE_DIR="$SCRIPT_DIR/FluidDAM"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/nginx.conf}"

# Create logs directory if it doesn't exist
mkdir -p logs

# ========================================
# Start Node.js API Server
# ========================================
echo "[1/2] Starting Node.js API Server (Port 3001)..."

if [ ! -f "$NODE_DIR/package.json" ]; then
    echo -e "${RED}[ERROR] package.json not found in $NODE_DIR${NC}"
    echo -e "${RED}[ERROR] Please check the path${NC}"
    exit 1
fi

# Check if server is already running
if lsof -ti:3001 > /dev/null 2>&1; then
    echo -e "${YELLOW}[INFO] API server already running on port 3001${NC}"
else
    cd "$NODE_DIR"
    nohup npm run server > "$SCRIPT_DIR/logs/unified-api-server-prod.log" 2>&1 &
    API_PID=$!
    echo "$API_PID" > "$SCRIPT_DIR/logs/unified-api-server-prod.pid"
    sleep 2
    
    # Verify it started
    if ps -p "$API_PID" > /dev/null 2>&1; then
        echo -e "${GREEN}[OK] API server started (PID: $API_PID)${NC}"
    else
        echo -e "${RED}[ERROR] Failed to start API server${NC}"
        exit 1
    fi
    cd "$SCRIPT_DIR"
fi
echo ""

# ========================================
# Start Nginx
# ========================================
echo "[2/2] Starting Nginx..."

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}[ERROR] Nginx is not installed${NC}"
    echo -e "${YELLOW}[INFO] Please install Nginx first:${NC}"
    echo "  Ubuntu/Debian: sudo apt-get install nginx"
    echo "  macOS: brew install nginx"
    echo "  Or specify NGINX_BIN environment variable"
    exit 1
fi

# Use custom nginx binary if specified
NGINX_BIN="${NGINX_BIN:-nginx}"

# Test nginx configuration
echo "[INFO] Testing Nginx configuration..."
if sudo "$NGINX_BIN" -t 2>/dev/null; then
    echo -e "${GREEN}[OK] Nginx configuration test passed${NC}"
else
    # Try without sudo
    if "$NGINX_BIN" -t 2>/dev/null; then
        echo -e "${GREEN}[OK] Nginx configuration test passed${NC}"
        NGINX_BIN="$NGINX_BIN"  # Use without sudo
    else
        echo -e "${RED}[ERROR] Nginx configuration test failed${NC}"
        echo -e "${RED}[ERROR] Please check your nginx.conf file${NC}"
        exit 1
    fi
fi

# Check if nginx is already running
if pgrep -x nginx > /dev/null; then
    NGINX_PID=$(pgrep -x nginx | head -1)
    echo -e "${YELLOW}[INFO] Nginx already running (PID: $NGINX_PID)${NC}"
    echo "[INFO] Reloading Nginx configuration..."
    
    # Try to reload
    if sudo "$NGINX_BIN" -s reload 2>/dev/null; then
        echo -e "${GREEN}[OK] Nginx reloaded${NC}"
    elif "$NGINX_BIN" -s reload 2>/dev/null; then
        echo -e "${GREEN}[OK] Nginx reloaded${NC}"
    else
        echo -e "${YELLOW}[WARN] Reload failed. Restarting Nginx...${NC}"
        # Kill existing nginx
        sudo pkill -9 nginx 2>/dev/null || pkill -9 nginx 2>/dev/null
        sleep 1
        # Start nginx
        if sudo "$NGINX_BIN" 2>/dev/null; then
            echo -e "${GREEN}[OK] Nginx restarted${NC}"
        elif "$NGINX_BIN" 2>/dev/null; then
            echo -e "${GREEN}[OK] Nginx restarted${NC}"
        else
            echo -e "${RED}[ERROR] Failed to restart Nginx${NC}"
            exit 1
        fi
    fi
else
    echo "[INFO] Starting Nginx..."
    # Kill any existing nginx processes
    sudo pkill -9 nginx 2>/dev/null || pkill -9 nginx 2>/dev/null
    sleep 1
    
    # Start nginx
    if sudo "$NGINX_BIN" 2>/dev/null; then
        echo -e "${GREEN}[OK] Nginx started${NC}"
    elif "$NGINX_BIN" 2>/dev/null; then
        echo -e "${GREEN}[OK] Nginx started${NC}"
    else
        echo -e "${RED}[ERROR] Failed to start Nginx${NC}"
        echo -e "${YELLOW}[INFO] You may need to run with sudo or check permissions${NC}"
        exit 1
    fi
fi
echo ""

echo "========================================"
echo -e "${GREEN}All services started successfully!${NC}"
echo "========================================"
echo ""
echo "Production URLs:"
echo "  - Home:      https://liquora.cn/"
echo "  - Link:      https://liquora.cn/link"
echo "  - BannerGen: https://liquora.cn/bannergen"
echo "  - SpotStudio: https://liquora.cn/spotstudio"
echo "  - API:       https://liquora.cn/api"
echo ""
echo "Log files are located in: ./logs/"
echo "  - unified-api-server-prod.log"
echo ""
echo "To stop all services, run: ./stop-production.sh"
echo ""

