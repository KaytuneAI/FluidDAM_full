#!/bin/bash

# Build script for all applications
# Usage: ./build-all.sh

set -e

echo "=========================================="
echo "Building FluidDAM Unified Applications"
echo "=========================================="
echo ""

# Build root entry (Home)
echo "[1/3] Building root entry (Home)..."
cd "$(dirname "$0")"
npm run build
echo "✓ Root entry built successfully"
echo ""

# Build Banner_gen
echo "[2/3] Building Banner_gen..."
cd Banner_gen
npm run build
echo "✓ Banner_gen built successfully"
echo ""

# Build FluidDAM
echo "[3/3] Building FluidDAM (SpotStudio)..."
cd ../FluidDAM
npm run build
echo "✓ FluidDAM built successfully"
echo ""

cd ..

echo "=========================================="
echo "All builds completed successfully!"
echo "=========================================="
echo ""
echo "Build outputs:"
echo "  - Root entry: ./dist/"
echo "  - Banner_gen: ./Banner_gen/dist/"
echo "  - FluidDAM:   ./FluidDAM/dist/"
echo ""

