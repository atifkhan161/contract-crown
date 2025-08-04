# Contract Crown - Raspberry Pi Deployment Guide

This guide will help you deploy Contract Crown card game on your Raspberry Pi using Docker.

## Prerequisites

### 1. Raspberry Pi Setup
- Raspberry Pi 3B+ or newer (4GB RAM recommended)
- Raspberry Pi OS (64-bit recommended)
- Docker installed on your Pi

### 2. Install Docker on Raspberry Pi

```bash
# Update your Pi
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose -y

# Reboot to apply group changes
sudo reboot
```

## Quick Deployment

### 1. Clone and Setup
```bash
# Clone the repository
git clone <your-repo-url>
cd contract-crown

# Copy environment file
cp .env.example .env

# Edit environment file (optional)
nano .env
```

### 2. Build and Start
```bash
# Make scripts executable
chmod +x docker-scripts/*.sh

# Build the container
./docker-scripts/build.sh

# Start the application
./docker-scripts/start.sh
```

### 3. Access Your Game
- **Local access**: http://localhost:3000
- **Network access**: http://YOUR_PI_IP:3000
- **Demo game**: http://YOUR_PI_IP:3000/game.html?demo=true

## Management Commands

### View Logs
```bash
./docker-scripts/logs.sh
# or
docker-compose logs -f
```

### Stop Application
```bash
./docker-scripts/stop.sh
# or
docker-compose down
```

### Restart Application
```bash
docker-compose restart
```

### Reset Everything
```bash
./docker-scripts/reset.sh
# or for full cleanup (saves space)
./docker-scripts/reset.sh full
```

## Network Access

### Find Your Pi's IP Address
```bash
hostname -I
```

### Access from Other Devices
Once running, you can access the game from any device on your network:
- **Phones**: http://YOUR_PI_IP:3000
- **Tablets**: http://YOUR_PI_IP:3000
- **Computers**: http://YOUR_PI_IP:3000

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker-compose logs

# Check if port is in use
sudo netstat -tlnp | grep :3000

# Restart Docker service
sudo systemctl restart docker
```

### Out of Space
```bash
# Clean up Docker
docker system prune -f
docker image prune -f

# Check disk usage
df -h
```

### Performance Issues
```bash
# Check Pi temperature
vcgencmd measure_temp

# Check memory usage
free -h

# Monitor container resources
docker stats
```

## Configuration Options

### Environment Variables (.env file)
```bash
# JWT Secret (change this!)
JWT_SECRET=your-secure-secret-here

# CORS (allow all for local network)
CORS_ORIGIN=*

# Rate limiting
RATE_LIMIT_MAX_REQUESTS=200

# Game settings
MAX_PLAYERS_PER_GAME=4
GAME_TIMEOUT_MS=1800000
```

### Port Configuration
To change the port from 3000:
1. Edit `docker-compose.yml`
2. Change `"3000:3000"` to `"YOUR_PORT:3000"`
3. Restart: `docker-compose down && docker-compose up -d`

## Performance Tips for Raspberry Pi

### 1. Optimize Pi Settings
```bash
# Increase GPU memory split
sudo raspi-config
# Advanced Options > Memory Split > 128

# Enable hardware acceleration
echo 'gpu_mem=128' | sudo tee -a /boot/config.txt
```

### 2. Monitor Resources
```bash
# Watch system resources
htop

# Monitor Docker containers
docker stats

# Check temperature
watch -n 1 vcgencmd measure_temp
```

### 3. Manage Docker Resources
```bash
# Limit container memory (add to docker-compose.yml)
deploy:
  resources:
    limits:
      memory: 512M
```

## Backup and Restore

### Backup Game Data
```bash
# Backup volumes
docker run --rm -v contract_crown_data:/data -v $(pwd):/backup alpine tar czf /backup/game-data-backup.tar.gz -C /data .
```

### Restore Game Data
```bash
# Restore volumes
docker run --rm -v contract_crown_data:/data -v $(pwd):/backup alpine tar xzf /backup/game-data-backup.tar.gz -C /data
```

## Security Considerations

### 1. Change Default Secrets
- Update `JWT_SECRET` in `.env`
- Use strong, unique passwords

### 2. Network Security
- Consider using a VPN for external access
- Set up firewall rules if needed

### 3. Regular Updates
```bash
# Update the application
git pull
./docker-scripts/reset.sh

# Update Pi system
sudo apt update && sudo apt upgrade -y
```

## Support

If you encounter issues:
1. Check the logs: `docker-compose logs`
2. Verify Pi resources: `htop` and `df -h`
3. Check network connectivity
4. Restart the container: `docker-compose restart`

## Game Features

- **Single Player Demo**: Play against AI bots
- **Multiplayer**: Up to 4 players on local network
- **Progressive Web App**: Install on mobile devices
- **Real-time**: WebSocket-based real-time gameplay
- **Responsive**: Works on phones, tablets, and computers

Enjoy playing Contract Crown on your Raspberry Pi! 🍓🎮