#!/bin/bash

# Build script for Contract Crown on Raspberry Pi

set -e

echo "🍓 Building Contract Crown for Raspberry Pi..."

# Check if running on ARM architecture
ARCH=$(uname -m)
echo "🔍 Detected architecture: $ARCH"

if [[ "$ARCH" == "armv7l" || "$ARCH" == "aarch64" ]]; then
    echo "✅ Running on ARM architecture (Raspberry Pi)"
else
    echo "⚠️  Not running on ARM architecture. Building anyway..."
fi

# Build the Docker image
echo "🏗️  Building Docker image..."
docker build -t contract-crown:raspberry-pi .

echo "✅ Docker image built successfully!"

# Show image size
echo "📦 Image details:"
docker images contract-crown:raspberry-pi

# Optional cleanup of build cache to save space on Pi
if [ "$1" = "clean" ]; then
    echo "🧹 Cleaning up build cache..."
    docker system prune -f
    echo "✅ Build cache cleaned"
fi