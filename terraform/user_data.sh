#!/bin/bash
set -e

# User data script for EC2 instance initialization
# This runs when the instance is first created

echo "Starting instance initialization..."

# Update system packages
yum update -y

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

echo "Instance initialization complete!"
