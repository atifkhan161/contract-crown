#!/bin/bash

# Install Contract Crown as a system service on Raspberry Pi

set -e

echo "🍓 Installing Contract Crown as a system service..."

# Get current directory
CURRENT_DIR=$(pwd)

# Create systemd service file
sudo tee /etc/systemd/system/contract-crown.service > /dev/null <<EOF
[Unit]
Description=Contract Crown Card Game
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable contract-crown.service

echo "✅ Service installed successfully!"
echo ""
echo "Service commands:"
echo "  Start:   sudo systemctl start contract-crown"
echo "  Stop:    sudo systemctl stop contract-crown"
echo "  Status:  sudo systemctl status contract-crown"
echo "  Logs:    journalctl -u contract-crown -f"
echo ""
echo "The service will now start automatically on boot!"