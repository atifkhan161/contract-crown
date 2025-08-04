#!/bin/bash

# Build and push Contract Crown image for Raspberry Pi

set -e

# Configuration
IMAGE_NAME="contract-crown"
REGISTRY_URL="${DOCKER_REGISTRY:-docker.io}"  # Default to Docker Hub
USERNAME="${DOCKER_USERNAME}"
VERSION="${VERSION:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🍓 Building Contract Crown for Raspberry Pi${NC}"
echo "=============================================="

# Check if username is provided
if [ -z "$USERNAME" ]; then
    echo -e "${YELLOW}⚠️  DOCKER_USERNAME not set. Using 'contractcrown' as default.${NC}"
    echo "   Set it with: export DOCKER_USERNAME=your-dockerhub-username"
    USERNAME="contractcrown"
fi

# Full image name
FULL_IMAGE_NAME="${REGISTRY_URL}/${USERNAME}/${IMAGE_NAME}:${VERSION}"
ARM_IMAGE_NAME="${REGISTRY_URL}/${USERNAME}/${IMAGE_NAME}:${VERSION}-arm64"

echo -e "${BLUE}📦 Image details:${NC}"
echo "  Registry: $REGISTRY_URL"
echo "  Username: $USERNAME"
echo "  Image: $IMAGE_NAME"
echo "  Version: $VERSION"
echo "  Full name: $FULL_IMAGE_NAME"
echo ""

# Build for ARM64 (Raspberry Pi 4)
echo -e "${BLUE}🏗️  Building ARM64 image for Raspberry Pi...${NC}"
docker buildx build \
    --platform linux/arm64 \
    --tag "$ARM_IMAGE_NAME" \
    --tag "$FULL_IMAGE_NAME" \
    --load \
    .

echo -e "${GREEN}✅ Build completed successfully!${NC}"

# Show image details
echo -e "${BLUE}📊 Image information:${NC}"
docker images | grep "$IMAGE_NAME"

# Ask if user wants to push
echo ""
read -p "🚀 Do you want to push the image to the registry? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}🚀 Pushing image to registry...${NC}"
    
    # Login check
    if ! docker info | grep -q "Username"; then
        echo -e "${YELLOW}🔐 Please login to Docker registry first:${NC}"
        echo "   docker login $REGISTRY_URL"
        exit 1
    fi
    
    # Push both tags
    docker push "$ARM_IMAGE_NAME"
    docker push "$FULL_IMAGE_NAME"
    
    echo -e "${GREEN}✅ Image pushed successfully!${NC}"
    echo ""
    echo -e "${GREEN}🎉 Your image is ready for Raspberry Pi deployment!${NC}"
    echo ""
    echo -e "${BLUE}📋 To deploy on your Raspberry Pi:${NC}"
    echo "  1. Copy docker-compose.pi.yml to your Pi"
    echo "  2. Run: docker-compose -f docker-compose.pi.yml pull"
    echo "  3. Run: docker-compose -f docker-compose.pi.yml up -d"
    echo ""
    echo -e "${BLUE}🌐 Or use the quick deploy command:${NC}"
    echo "  docker run -d -p 3000:3000 --name contract-crown $FULL_IMAGE_NAME"
else
    echo -e "${YELLOW}⏭️  Skipping push. Image is ready for local testing.${NC}"
fi

echo ""
echo -e "${GREEN}🎮 Happy gaming on your Raspberry Pi!${NC}"