#!/bin/bash

# FluidDAM Unified Entry Application - Development Startup Script for Ubuntu/Linux
# This script starts all required services for development

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "Starting FluidDAM Unified Entry Application..."
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

# Function to check and install dependencies
check_dependencies() {
    local dir=$1
    local name=$2
    
    if [ ! -d "$dir/node_modules" ]; then
        echo -e "${YELLOW}[Warning] node_modules not found in $name, installing dependencies...${NC}"
        cd "$SCRIPT_DIR/$dir"
        npm install
        cd "$SCRIPT_DIR"
        echo ""
    fi
}

# Check and install dependencies
check_dependencies "." "root directory"
check_dependencies "Banner_gen" "Banner_gen"
check_dependencies "FluidDAM" "FluidDAM"

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to start a service in background
start_service() {
    local name=$1
    local dir=$2
    local command=$3
    local port=$4
    
    echo "Starting $name (Port $port)..."
    cd "$SCRIPT_DIR/$dir"
    
    # Start the service in background and save PID
    nohup bash -c "$command" > "$SCRIPT_DIR/logs/${name,,}-dev.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$SCRIPT_DIR/logs/${name,,}-dev.pid"
    
    echo -e "${GREEN}  ✓ $name started (PID: $pid)${NC}"
    echo ""
    
    cd "$SCRIPT_DIR"
    sleep 2
}

# Start services in order
start_service "Unified API Server" "FluidDAM" "npm run server" "3001"
start_service "Banner_gen" "Banner_gen" "npm run dev" "5173"
start_service "FluidDAM (SpotStudio)" "FluidDAM" "npm run dev" "5174"
start_service "Unified Entry" "." "npm run dev" "3000"

# Wait a bit for services to start
sleep 3

echo ""
echo "========================================"
echo -e "${GREEN}All applications started!${NC}"
echo "========================================"
echo ""
echo "Unified Entry: http://localhost:3000"
echo "  - Banner_gen: http://localhost:3000/Banner_gen"
echo "  - FluidDAM: http://localhost:3000/FluidDAM"
echo "  - API: http://localhost:3000/api"
echo ""
echo "Standalone Access (for development/debugging):"
echo "  - Banner_gen: http://localhost:5173"
echo "  - FluidDAM (SpotStudio): http://localhost:5174"
echo "  - Unified API: http://localhost:3001 (FluidDAM + Banner_gen + Jimeng AI proxy)"
echo ""
echo -e "${YELLOW}Tip: Recommended to use unified entry - only one port to remember!${NC}"
echo ""
echo "Log files are located in: ./logs/"
echo "  - unified-api-server-dev.log"
echo "  - banner_gen-dev.log"
echo "  - fluiddam-dev.log"
echo "  - unified-entry-dev.log"
echo ""
echo "To stop all services, run: ./stop-dev.sh"
echo ""

