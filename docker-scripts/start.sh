#!/bin/bash

# Start script for Contract Crown on Raspberry Pi

set -e

echo "🍓 Starting Contract Crown on Raspberry Pi..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env file with your Raspberry Pi configuration."
    echo "💡 Don't forget to set your Pi's IP address for network access!"
    exit 1
fi

# Get Raspberry Pi IP address
PI_IP=$(hostname -I | awk '{print $1}')
echo "🌐 Raspberry Pi IP address: $PI_IP"

# Start the application
echo "🚀 Starting Contract Crown container..."
docker-compose up -d

echo "⏳ Waiting for application to be ready..."
sleep 15

# Check if service is running
echo "📊 Container status:"
docker-compose ps

# Test if application is responding
if curl -f -s http://localhost:3000/health > /dev/null; then
    echo ""
    echo "✅ Contract Crown is running successfully!"
    echo "🌐 Local access: http://localhost:3000"
    echo "🌐 Network access: http://$PI_IP:3000"
    echo "🎮 Demo game: http://$PI_IP:3000/game.html?demo=true"
    echo ""
    echo "📋 To view logs: docker-compose logs -f"
    echo "🛑 To stop: docker-compose down"
    echo "🔄 To restart: docker-compose restart"
else
    echo "❌ Application may not be ready yet. Check logs with: docker-compose logs"
fi