#!/bin/bash

# Stop script for Contract Crown application

set -e

echo "🛑 Stopping Contract Crown application..."

# Stop all services
docker-compose down

echo "✅ All services stopped!"

# Optional: Remove volumes (use with caution)
if [ "$1" = "clean" ]; then
    echo "🧹 Removing volumes (this will delete all data)..."
    read -p "Are you sure? This will delete all database data! (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down -v
        echo "🗑️  Volumes removed"
    else
        echo "❌ Volume removal cancelled"
    fi
fi