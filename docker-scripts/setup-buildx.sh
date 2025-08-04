#!/bin/bash

# Setup Docker Buildx for multi-architecture builds

set -e

echo "🔧 Setting up Docker Buildx for ARM builds..."

# Check if buildx is available
if ! docker buildx version > /dev/null 2>&1; then
    echo "❌ Docker Buildx is not available. Please update Docker to a newer version."
    exit 1
fi

# Create a new builder instance
echo "🏗️  Creating buildx builder instance..."
docker buildx create --name contract-crown-builder --use --bootstrap

# Enable experimental features
echo "🧪 Enabling experimental features..."
export DOCKER_CLI_EXPERIMENTAL=enabled

# List available platforms
echo "📋 Available platforms:"
docker buildx ls

echo "✅ Docker Buildx setup complete!"
echo ""
echo "You can now build multi-architecture images with:"
echo "  docker buildx build --platform linux/arm64,linux/amd64 -t your-image ."