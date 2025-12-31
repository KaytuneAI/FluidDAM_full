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

# Copy files to web directory (production deployment)
echo "[4/4] Copying files to /var/www/html/..."
echo ""

# Check if running as root or with sudo
if [ "$EUID" -eq 0 ] || [ -n "$SUDO_USER" ]; then
    SUDO_CMD=""
else
    SUDO_CMD="sudo"
    echo "Note: Using sudo to copy files to /var/www/html/"
fi

# Create directories if they don't exist
$SUDO_CMD mkdir -p /var/www/html/bannergen
$SUDO_CMD mkdir -p /var/www/html/spotstudio
$SUDO_CMD mkdir -p /var/www/html/shares

# Copy Home page
echo "  Copying Home page..."
$SUDO_CMD cp -r ./dist/* /var/www/html/ 2>/dev/null || {
    echo "  ⚠ Warning: Failed to copy Home page files"
}

# Copy BannerGen
echo "  Copying BannerGen..."
$SUDO_CMD cp -r ./Banner_gen/dist/* /var/www/html/bannergen/ 2>/dev/null || {
    echo "  ⚠ Warning: Failed to copy BannerGen files"
}

# Copy SpotStudio (FluidDAM)
echo "  Copying SpotStudio (FluidDAM)..."
$SUDO_CMD cp -r ./FluidDAM/dist/* /var/www/html/spotstudio/ 2>/dev/null || {
    echo "  ⚠ Warning: Failed to copy SpotStudio files"
}

# Copy shares and images-database.json (if they exist)
if [ -d "./FluidDAM/public/shares" ] && [ "$(ls -A ./FluidDAM/public/shares 2>/dev/null)" ]; then
    echo "  Copying shares..."
    $SUDO_CMD cp -r ./FluidDAM/public/shares/* /var/www/html/shares/ 2>/dev/null || {
        echo "  ⚠ Warning: Failed to copy shares"
    }
fi

if [ -f "./FluidDAM/public/images-database.json" ]; then
    echo "  Copying images-database.json..."
    $SUDO_CMD cp ./FluidDAM/public/images-database.json /var/www/html/ 2>/dev/null || {
        echo "  ⚠ Warning: Failed to copy images-database.json"
    }
fi

# Set proper permissions
echo "  Setting permissions..."
$SUDO_CMD chown -R www-data:www-data /var/www/html/ 2>/dev/null || {
    echo "  ⚠ Warning: Failed to set ownership (may need to run manually)"
}
$SUDO_CMD chmod -R 755 /var/www/html/ 2>/dev/null || {
    echo "  ⚠ Warning: Failed to set permissions (may need to run manually)"
}

echo ""
echo "✓ Files copied to /var/www/html/ successfully!"
echo ""
echo "Deployment locations:"
echo "  - Home:      /var/www/html/"
echo "  - BannerGen: /var/www/html/bannergen/"
echo "  - SpotStudio: /var/www/html/spotstudio/"
echo "  - Shares:    /var/www/html/shares/"
echo ""

