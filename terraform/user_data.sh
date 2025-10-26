#!/bin/bash
set -ex  # Enable command tracing for debugging

# User data script for EC2 instance initialization
# This runs when the instance is first created
# Version: 2.0

exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "=== Starting instance initialization at $(date) ==="

# Update system packages
yum update -y

# Install SSM agent (required for AL2023)
echo "=== Installing SSM agent at $(date) ==="
yum install -y amazon-ssm-agent || {
    echo "ERROR: Failed to install SSM agent"
    exit 1
}

systemctl enable amazon-ssm-agent
systemctl start amazon-ssm-agent

# Wait for SSM agent to start
sleep 5

# Verify SSM agent is running
if systemctl is-active --quiet amazon-ssm-agent; then
    echo "✓ SSM agent is running"
    systemctl status amazon-ssm-agent --no-pager
else
    echo "ERROR: SSM agent failed to start"
    systemctl status amazon-ssm-agent --no-pager
    exit 1
fi

echo "=== SSM agent installation complete at $(date) ==="

# Install Node.js 20.x (LTS)
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# Install git and rsync
yum install -y git rsync

# Install PM2 globally for process management
npm install -g pm2

# Create application directory
mkdir -p /home/ec2-user/${app_name}
chown ec2-user:ec2-user /home/ec2-user/${app_name}

# Create environment file placeholder
cat > /home/ec2-user/${app_name}/.env.local <<'EOF'
# Environment variables
# These should be set via GitHub Actions secrets during deployment
NODE_ENV=${node_env}
EOF

chown ec2-user:ec2-user /home/ec2-user/${app_name}/.env.local

# Create PM2 ecosystem file
cat > /home/ec2-user/${app_name}/ecosystem.config.cjs <<'EOF'
module.exports = {
  apps: [{
    name: '${app_name}',
    script: './bin/www',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: '${node_env}'
    },
    error_file: '/home/ec2-user/${app_name}/logs/error.log',
    out_file: '/home/ec2-user/${app_name}/logs/output.log',
    log_file: '/home/ec2-user/${app_name}/logs/combined.log',
    time: true
  }]
};
EOF

chown ec2-user:ec2-user /home/ec2-user/${app_name}/ecosystem.config.cjs

# Create logs directory
mkdir -p /home/ec2-user/${app_name}/logs
chown -R ec2-user:ec2-user /home/ec2-user/${app_name}/logs

# Setup PM2 to start on system boot
env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user

echo "=== Instance initialization complete at $(date) ==="
echo "✓ SSM agent installed and running"
echo "✓ Node.js installed"
echo "✓ PM2 configured"
echo "✓ Application directory created"
echo "User data script finished successfully"
