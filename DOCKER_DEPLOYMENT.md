# Contract Crown - Docker Deployment Guide

This guide covers different ways to deploy Contract Crown using Docker, including building and pushing images for Raspberry Pi deployment.

## 🚀 Quick Start Options

### Option 1: Quick Deploy (Recommended)
Deploy everything in one command:
```bash
# Set your Docker Hub username and Pi IP
export DOCKER_USERNAME=your-dockerhub-username
export PI_HOST=192.168.1.100

# Run quick deploy
chmod +x docker-scripts/*.sh
./docker-scripts/quick-deploy.sh
```

### Option 2: Step by Step

#### 1. Setup Docker Buildx
```bash
./docker-scripts/setup-buildx.sh
```

#### 2. Build and Push Image
```bash
export DOCKER_USERNAME=your-dockerhub-username
./docker-scripts/build-and-push.sh
```

#### 3. Deploy to Pi
```bash
export PI_HOST=192.168.1.100
./docker-scripts/deploy-to-pi.sh
```

### Option 3: Local Build and Deploy
```bash
# Build locally
./docker-scripts/build.sh

# Copy files to Pi and deploy
scp docker-compose.yml pi@192.168.1.100:~/
ssh pi@192.168.1.100 "docker-compose up -d"
```

## 📦 Image Registry Options

### Docker Hub (Default)
```bash
export DOCKER_USERNAME=your-dockerhub-username
export DOCKER_REGISTRY=docker.io  # Optional, this is default
```

### GitHub Container Registry
```bash
export DOCKER_USERNAME=your-github-username
export DOCKER_REGISTRY=ghcr.io
```

### Private Registry
```bash
export DOCKER_USERNAME=your-username
export DOCKER_REGISTRY=your-registry.com
```

## 🍓 Raspberry Pi Deployment

### Prerequisites on Pi
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker pi

# Install Docker Compose
sudo apt install docker-compose -y

# Reboot
sudo reboot
```

### SSH Setup
Make sure you can SSH to your Pi:
```bash
ssh pi@192.168.1.100
```

### Environment Variables
Create `.env` file on your Pi:
```bash
# Copy example
cp .env.example .env

# Edit as needed
nano .env
```

## 🔧 Configuration

### Environment Variables
- `DOCKER_USERNAME`: Your Docker registry username
- `PI_HOST`: Your Raspberry Pi's IP address
- `PI_USER`: SSH user for Pi (default: pi)
- `VERSION`: Image version tag (default: latest)
- `DOCKER_REGISTRY`: Registry URL (default: docker.io)

### Application Settings
Edit `.env` file on your Pi:
```bash
JWT_SECRET=your-secure-secret
CORS_ORIGIN=*
MAX_PLAYERS_PER_GAME=4
```

## 📊 Monitoring and Management

### Check Status
```bash
# On Pi
docker-compose ps
docker-compose logs -f

# Remote
ssh pi@192.168.1.100 "docker-compose ps"
```

### Update Application
```bash
# Remote update
ssh pi@192.168.1.100 "docker-compose pull && docker-compose up -d"

# Or redeploy
./docker-scripts/deploy-to-pi.sh
```

### Resource Monitoring
```bash
# On Pi
docker stats
htop
vcgencmd measure_temp

# Remote
ssh pi@192.168.1.100 "docker stats --no-stream"
```

## 🐳 Docker Commands Reference

### Build Commands
```bash
# Build for ARM64 (Pi 4)
docker buildx build --platform linux/arm64 -t contract-crown:pi .

# Build multi-arch
docker buildx build --platform linux/arm64,linux/amd64 -t contract-crown:latest .
```

### Registry Commands
```bash
# Login
docker login docker.io

# Push
docker push your-username/contract-crown:latest

# Pull on Pi
docker pull your-username/contract-crown:latest
```

### Container Management
```bash
# Run directly
docker run -d -p 3000:3000 --name contract-crown your-username/contract-crown:latest

# Using compose
docker-compose up -d
docker-compose down
docker-compose restart
docker-compose logs -f
```

## 🔍 Troubleshooting

### Build Issues
```bash
# Clean build cache
docker system prune -f

# Rebuild without cache
docker-compose build --no-cache
```

### Pi Connection Issues
```bash
# Test SSH
ssh -o ConnectTimeout=5 pi@192.168.1.100 "echo 'Connected'"

# Check Pi is on network
ping 192.168.1.100
```

### Container Issues
```bash
# Check logs
docker-compose logs contract-crown

# Check health
docker exec contract-crown node src/health-check.js

# Restart container
docker-compose restart
```

### Performance Issues on Pi
```bash
# Check temperature
vcgencmd measure_temp

# Check memory
free -h

# Limit container memory
# Add to docker-compose.yml:
deploy:
  resources:
    limits:
      memory: 512M
```

## 🌐 Access Your Game

Once deployed, access your game at:
- **Local**: http://localhost:3000
- **Network**: http://YOUR_PI_IP:3000
- **Demo**: http://YOUR_PI_IP:3000/game.html?demo=true

## 🔒 Security Notes

1. Change default JWT secret in `.env`
2. Consider using a reverse proxy for HTTPS
3. Set up firewall rules if exposing to internet
4. Regularly update the container image

## 📱 Mobile Access

The game works great on mobile devices:
1. Connect phone/tablet to same network as Pi
2. Open browser and go to `http://YOUR_PI_IP:3000`
3. Add to home screen for app-like experience

Enjoy your Contract Crown game on Raspberry Pi! 🎮🍓