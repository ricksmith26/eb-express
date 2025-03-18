#!/bin/bash

# Set variables
EC2_USER="ec2-user"
EC2_IP="18.175.192.81"  # Replace with your EC2 public IP
PEM_KEY="~/.ssh/ai-fhir-server.pem"  # Path to your SSH key
APP_DIR="/home/ec2-user/eb-express"  # Directory on EC2

echo "🚀 Deploying to EC2 ($EC2_IP)..."

# Step 1: Upload latest code using rsync (fast & only changed files)
echo "📂 Syncing files..."
rsync -avz --progress -e "ssh -i $PEM_KEY" --exclude 'node_modules' --exclude '.git' ./ $EC2_USER@$EC2_IP:$APP_DIR

# Step 2: SSH into EC2 and restart the app
echo "🔄 Restarting app on EC2..."
ssh -i $PEM_KEY $EC2_USER@$EC2_IP <<EOF
  cd $APP_DIR
  npm install --production
  pm2 restart eb-express || pm2 start server.js --name "eb-express"
  exit
EOF

echo "✅ Deployment complete!"