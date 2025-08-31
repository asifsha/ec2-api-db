#!/bin/bash
set -euo pipefail
mkdir -p /opt/app
systemctl stop nodeapi.service || true
