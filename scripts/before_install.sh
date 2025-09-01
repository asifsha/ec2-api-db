#!/bin/bash
set -euo pipefail

# Ensure app directory exists
mkdir -p /opt/app

# Stop service if it exists
systemctl stop nodeapi.service || true

# Copy and install systemd service file
cp /opt/app/scripts/nodeapi.service /etc/systemd/system/nodeapi.service

# Reload systemd so it knows about our new/updated service
systemctl daemon-reexec
systemctl daemon-reload
