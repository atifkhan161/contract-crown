#!/bin/bash

# Quick deployment script for Raspberry Pi
# This script will build, push, and deploy in one go

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 Contract Crown - Quick Deploy to Raspberry Pi${NC}"
echo "=================================================="

# Check required environment variables
if [ -z "$DOCKER_USERNAME" ]; then
    echo -e "${YELLOW}⚠️  DOCKER_USERNAME not set. Using 'contractcrown' as default.${NC}"
    export DOCKER_USERNAME="contractcrown"
fi

if [ -z "$PI_HOST" ]; then
    echo -e "${YELLOW}⚠️  PI_HOST not set. Please enter your Pi's IP address:${NC}"
    read -p "Pi IP Address: " PI_HOST
    export PI_HOST
fi

echo -e "${BLUE}📋 Deployment Configuration:${NC}"
echo "  Docker Username: $DOCKER_USERNAME"
echo "  Pi Host: $PI_HOST"
echo "  Pi User: ${PI_USER:-pi}"
echo ""

# Step 1: Setup buildx if needed
echo -e "${BLUE}🔧 Step 1: Setting up Docker Buildx...${NC}"
if ! docker buildx ls | grep -q "contract-crown-builder"; then
    ./docker-scripts/setup-buildx.sh
else
    echo "✅ Buildx already configured"
fi

# Step 2: Build and push image
echo -e "${BLUE}🏗️  Step 2: Building and pushing image...${NC}"
./docker-scripts/build-and-push.sh

# Step 3: Deploy to Pi
echo -e "${BLUE}🍓 Step 3: Deploying to Raspberry Pi...${NC}"
./docker-scripts/deploy-to-pi.sh

echo ""
echo -e "${GREEN}🎉 Quick deployment completed successfully!${NC}"
echo -e "${GREEN}🎮 Your Contract Crown game is now running on your Raspberry Pi!${NC}"