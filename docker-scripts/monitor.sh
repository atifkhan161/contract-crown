#!/bin/bash

# Monitor Contract Crown on Raspberry Pi

set -e

echo "🍓 Contract Crown - Raspberry Pi Monitor"
echo "========================================"

# Get Pi IP
PI_IP=$(hostname -I | awk '{print $1}')

# Check if container is running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Container Status: Running"
else
    echo "❌ Container Status: Not Running"
    exit 1
fi

# Check application health
if curl -f -s http://localhost:3000/health > /dev/null; then
    echo "✅ Application Health: OK"
else
    echo "❌ Application Health: Failed"
fi

# System information
echo ""
echo "📊 System Information:"
echo "  IP Address: $PI_IP"
echo "  Temperature: $(vcgencmd measure_temp)"
echo "  Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "  Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"

# Docker stats
echo ""
echo "🐳 Container Resources:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Access URLs
echo ""
echo "🌐 Access URLs:"
echo "  Local: http://localhost:3000"
echo "  Network: http://$PI_IP:3000"
echo "  Demo Game: http://$PI_IP:3000/game.html?demo=true"

# Recent logs (last 10 lines)
echo ""
echo "📋 Recent Logs:"
docker-compose logs --tail=10