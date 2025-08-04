#!/bin/bash

# Deploy Contract Crown to Raspberry Pi using pre-built image

set -e

# Configuration
PI_HOST="${PI_HOST}"
PI_USER="${PI_USER:-pi}"
IMAGE_NAME="${DOCKER_USERNAME:-contractcrown}/contract-crown:${VERSION:-latest}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🍓 Deploying Contract Crown to Raspberry Pi${NC}"
echo "=============================================="

# Check if PI_HOST is set
if [ -z "$PI_HOST" ]; then
    echo -e "${RED}❌ PI_HOST not set!${NC}"
    echo "   Set it with: export PI_HOST=192.168.1.100"
    echo "   Or run: PI_HOST=192.168.1.100 ./docker-scripts/deploy-to-pi.sh"
    exit 1
fi

echo -e "${BLUE}📡 Deployment details:${NC}"
echo "  Pi Host: $PI_HOST"
echo "  Pi User: $PI_USER"
echo "  Image: $IMAGE_NAME"
echo ""

# Test SSH connection
echo -e "${BLUE}🔗 Testing SSH connection to Pi...${NC}"
if ! ssh -o ConnectTimeout=5 "$PI_USER@$PI_HOST" "echo 'SSH connection successful'" 2>/dev/null; then
    echo -e "${RED}❌ Cannot connect to Pi via SSH!${NC}"
    echo "   Make sure:"
    echo "   1. SSH is enabled on your Pi"
    echo "   2. You can connect: ssh $PI_USER@$PI_HOST"
    echo "   3. Your Pi is on the network"
    exit 1
fi

echo -e "${GREEN}✅ SSH connection successful${NC}"

# Copy deployment files to Pi
echo -e "${BLUE}📁 Copying deployment files to Pi...${NC}"
scp docker-compose.pi.yml "$PI_USER@$PI_HOST:~/docker-compose.yml"
scp .env.example "$PI_USER@$PI_HOST:~/.env.example"

# Create .env file if it doesn't exist
ssh "$PI_USER@$PI_HOST" "
    if [ ! -f .env ]; then
        cp .env.example .env
        echo '✅ Created .env file from example'
    else
        echo '📝 .env file already exists'
    fi
"

# Deploy on Pi
echo -e "${BLUE}🚀 Deploying on Raspberry Pi...${NC}"
ssh "$PI_USER@$PI_HOST" "
    echo '🐳 Pulling latest image...'
    docker pull $IMAGE_NAME
    
    echo '🛑 Stopping existing container...'
    docker-compose down 2>/dev/null || true
    
    echo '🚀 Starting new container...'
    DOCKER_USERNAME=${DOCKER_USERNAME:-contractcrown} VERSION=${VERSION:-latest} docker-compose up -d
    
    echo '⏳ Waiting for container to be ready...'
    sleep 15
    
    echo '📊 Container status:'
    docker-compose ps
    
    echo '🌡️  System info:'
    echo \"  Temperature: \$(vcgencmd measure_temp 2>/dev/null || echo 'N/A')\"
    echo \"  Memory: \$(free -h | grep Mem | awk '{print \$3 \"/\" \$2}')\"
    
    PI_IP=\$(hostname -I | awk '{print \$1}')
    echo ''
    echo '✅ Deployment completed!'
    echo \"🌐 Access your game at: http://\$PI_IP:3000\"
    echo \"🎮 Demo game: http://\$PI_IP:3000/game.html?demo=true\"
"

echo ""
echo -e "${GREEN}🎉 Contract Crown deployed successfully to your Raspberry Pi!${NC}"
echo ""
echo -e "${BLUE}📋 Useful commands for your Pi:${NC}"
echo "  View logs: ssh $PI_USER@$PI_HOST 'docker-compose logs -f'"
echo "  Restart:   ssh $PI_USER@$PI_HOST 'docker-compose restart'"
echo "  Stop:      ssh $PI_USER@$PI_HOST 'docker-compose down'"
echo "  Update:    ssh $PI_USER@$PI_HOST 'docker-compose pull && docker-compose up -d'"