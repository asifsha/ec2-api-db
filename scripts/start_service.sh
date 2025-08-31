#!/bin/bash
set -euo pipefail
systemctl enable nodeapi.service
systemctl restart nodeapi.service
