#!/bin/bash
set -euo pipefail
cd /opt/app

# Install Node (Amazon Linux 2023 uses dnf)
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
  dnf install -y nodejs
fi

npm ci || npm install

# systemd service
cat >/etc/systemd/system/nodeapi.service <<'EOF'
[Unit]
Description=Node API (Dynamo + Cognito)
After=network.target

[Service]
Environment=PORT=3000
Environment=TABLE_NAME=${TABLE_NAME}
Environment=USER_POOL_ID=${USER_POOL_ID}
Environment=COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
Environment=AWS_REGION=${AWS_REGION}
WorkingDirectory=/opt/app
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=3
User=ec2-user

[Install]
WantedBy=multi-user.target
EOF

# Fill env from /etc/environment if present
source /etc/environment || true
sed -i "s|\${TABLE_NAME}|${TABLE_NAME}|g" /etc/systemd/system/nodeapi.service
sed -i "s|\${USER_POOL_ID}|${USER_POOL_ID}|g" /etc/systemd/system/nodeapi.service
sed -i "s|\${COGNITO_CLIENT_ID}|${COGNITO_CLIENT_ID}|g" /etc/systemd/system/nodeapi.service
sed -i "s|\${AWS_REGION}|${AWS_REGION}|g" /etc/systemd/system/nodeapi.service

systemctl daemon-reload
