#!/bin/bash

# Test build script for Contract Crown Docker container

set -e

echo "🧪 Testing Contract Crown Docker build..."

# Build the image
echo "🏗️  Building Docker image..."
docker build -t contract-crown:test .

echo "✅ Build completed successfully!"

# Test the container
echo "🚀 Testing container startup..."
CONTAINER_ID=$(docker run -d -p 3001:3000 --name contract-crown-test contract-crown:test)

echo "⏳ Waiting for container to start..."
sleep 10

# Check if container is running
if docker ps | grep -q contract-crown-test; then
    echo "✅ Container is running"
    
    # Test health endpoint
    if curl -f -s http://localhost:3001/health > /dev/null; then
        echo "✅ Health check passed"
    else
        echo "❌ Health check failed"
    fi
    
    # Test if static files are served
    if curl -f -s http://localhost:3001/ > /dev/null; then
        echo "✅ Static files are being served"
    else
        echo "❌ Static files not accessible"
    fi
    
else
    echo "❌ Container failed to start"
    docker logs contract-crown-test
fi

# Cleanup
echo "🧹 Cleaning up test container..."
docker stop contract-crown-test 2>/dev/null || true
docker rm contract-crown-test 2>/dev/null || true

echo "🎉 Test completed!"