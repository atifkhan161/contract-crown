#!/bin/bash

# Reset script for Contract Crown on Raspberry Pi
# This will stop everything, remove containers, and start fresh

set -e

echo "🍓 Resetting Contract Crown on Raspberry Pi..."

# Stop and remove everything
echo "🛑 Stopping container..."
docker-compose down

echo "🧹 Removing container and cleaning up..."
docker-compose down --remove-orphans

# Optional: Clean up images to save space on Pi
if [ "$1" = "full" ]; then
    echo "🗑️  Removing old images to save space..."
    docker image prune -f
    docker system prune -f
fi

echo "🏗️  Rebuilding application..."
docker-compose build --no-cache

echo "🚀 Starting fresh..."
docker-compose up -d

echo "⏳ Waiting for application to be ready..."
sleep 20

# Get Pi IP
PI_IP=$(hostname -I | awk '{print $1}')

echo "📊 Container status:"
docker-compose ps

echo ""
echo "✅ Contract Crown has been reset and is running!"
echo "🌐 Local access: http://localhost:3000"
echo "🌐 Network access: http://$PI_IP:3000"