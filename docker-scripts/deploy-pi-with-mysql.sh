#!/bin/bash

# Deploy Contract Crown to Raspberry Pi with MySQL options

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🍓 Contract Crown - Raspberry Pi Deployment with Database${NC}"
echo "=========================================================="

# Check required environment variables
if [ -z "$PI_HOST" ]; then
    echo -e "${YELLOW}⚠️  PI_HOST not set. Please enter your Pi's IP address:${NC}"
    read -p "Pi IP Address: " PI_HOST
    export PI_HOST
fi

PI_USER="${PI_USER:-pi}"
DOCKER_USERNAME="${DOCKER_USERNAME:-contractcrown}"

echo -e "${BLUE}📋 Deployment Configuration:${NC}"
echo "  Pi Host: $PI_HOST"
echo "  Pi User: $PI_USER"
echo "  Docker Username: $DOCKER_USERNAME"
echo ""

# Ask about MySQL setup
echo -e "${BLUE}🗄️  Database Setup Options:${NC}"
echo "1. Use existing MySQL on Pi (localhost:3306)"
echo "2. Deploy MySQL container with the application"
echo "3. Connect to external MySQL server"
echo ""
read -p "Choose option (1-3): " DB_OPTION

case $DB_OPTION in
    1)
        COMPOSE_FILE="docker-compose.pi.yml"
        echo -e "${GREEN}✅ Using existing MySQL on Pi${NC}"
        ;;
    2)
        COMPOSE_FILE="docker-compose.full.yml"
        echo -e "${GREEN}✅ Will deploy MySQL container${NC}"
        ;;
    3)
        COMPOSE_FILE="docker-compose.pi.yml"
        echo -e "${YELLOW}⚠️  You'll need to configure DB_HOST in .env file${NC}"
        ;;
    *)
        echo -e "${RED}❌ Invalid option${NC}"
        exit 1
        ;;
esac

# Test SSH connection
echo -e "${BLUE}🔗 Testing SSH connection to Pi...${NC}"
if ! ssh -o ConnectTimeout=5 "$PI_USER@$PI_HOST" "echo 'SSH connection successful'" 2>/dev/null; then
    echo -e "${RED}❌ Cannot connect to Pi via SSH!${NC}"
    echo "   Make sure SSH is enabled and you can connect: ssh $PI_USER@$PI_HOST"
    exit 1
fi

echo -e "${GREEN}✅ SSH connection successful${NC}"

# Copy deployment files to Pi
echo -e "${BLUE}📁 Copying deployment files to Pi...${NC}"
scp "$COMPOSE_FILE" "$PI_USER@$PI_HOST:~/docker-compose.yml"
scp .env.example "$PI_USER@$PI_HOST:~/.env.example"

# Create .env file if it doesn't exist
ssh "$PI_USER@$PI_HOST" "
    if [ ! -f .env ]; then
        cp .env.example .env
        echo '✅ Created .env file from example'
        echo '📝 Please edit .env file with your database configuration'
        
        # Set default database password for option 2
        if [ '$DB_OPTION' = '2' ]; then
            echo 'MYSQL_ROOT_PASSWORD=contractcrown123' >> .env
            echo 'DB_PASSWORD=contractpass' >> .env
            echo '🔐 Set default database passwords'
        fi
    else
        echo '📝 .env file already exists'
    fi
"

# Deploy on Pi
echo -e "${BLUE}🚀 Deploying on Raspberry Pi...${NC}"
ssh "$PI_USER@$PI_HOST" "
    echo '🐳 Pulling latest image...'
    docker pull $DOCKER_USERNAME/contract-crown:latest
    
    echo '🛑 Stopping existing containers...'
    docker-compose down 2>/dev/null || true
    
    echo '🚀 Starting containers...'
    DOCKER_USERNAME=$DOCKER_USERNAME docker-compose up -d
    
    echo '⏳ Waiting for containers to be ready...'
    sleep 30
    
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
    
    # Check if application is responding
    if curl -f -s http://localhost:3000/health > /dev/null; then
        echo '💚 Application health check passed'
    else
        echo '⚠️  Application may still be starting up'
        echo '📋 Check logs with: docker-compose logs -f'
    fi
"

echo ""
echo -e "${GREEN}🎉 Contract Crown deployed successfully to your Raspberry Pi!${NC}"

if [ "$DB_OPTION" = "2" ]; then
    echo ""
    echo -e "${BLUE}🗄️  Database Information:${NC}"
    echo "  MySQL Root Password: contractcrown123"
    echo "  Database Name: contract_crown"
    echo "  Database User: contractcrown"
    echo "  Database Password: contractpass"
    echo ""
    echo -e "${YELLOW}⚠️  Change these passwords in production!${NC}"
fi

echo ""
echo -e "${BLUE}📋 Useful commands for your Pi:${NC}"
echo "  View logs: ssh $PI_USER@$PI_HOST 'docker-compose logs -f'"
echo "  Restart:   ssh $PI_USER@$PI_HOST 'docker-compose restart'"
echo "  Stop:      ssh $PI_USER@$PI_HOST 'docker-compose down'"
echo "  Update:    ssh $PI_USER@$PI_HOST 'docker-compose pull && docker-compose up -d'"