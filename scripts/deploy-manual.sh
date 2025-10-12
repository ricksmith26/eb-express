#!/bin/bash
set -e

# Manual deployment script for testing
# This replicates what GitHub Actions does but runs locally

echo "🚀 Manual deployment script for eb-express"
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the project root directory"
    exit 1
fi

# Check if Terraform has been applied
if [ ! -d "terraform/.terraform" ]; then
    echo "❌ Error: Terraform not initialized. Run 'cd terraform && terraform init' first"
    exit 1
fi

# Get instance IP from Terraform
cd terraform
INSTANCE_IP=$(terraform output -raw instance_public_ip 2>/dev/null)

if [ -z "$INSTANCE_IP" ]; then
    echo "❌ Error: Could not get instance IP from Terraform"
    echo "Make sure you have run 'terraform apply' first"
    exit 1
fi

cd ..

echo "📍 Instance IP: $INSTANCE_IP"
echo ""

# Check if SSH key exists
if [ ! -f ~/.ssh/eb-express-key ]; then
    echo "❌ Error: SSH key not found at ~/.ssh/eb-express-key"
    echo "Generate one with: ssh-keygen -t rsa -b 4096 -f ~/.ssh/eb-express-key"
    exit 1
fi

# Test SSH connection
echo "🔐 Testing SSH connection..."
if ! ssh -i ~/.ssh/eb-express-key -o ConnectTimeout=5 ec2-user@$INSTANCE_IP "echo 'SSH connection successful'" > /dev/null 2>&1; then
    echo "❌ Error: Cannot connect to EC2 instance"
    echo "Check your security group allows SSH from your IP"
    exit 1
fi
echo "✅ SSH connection successful"
echo ""

# Check if .env.local exists locally
if [ ! -f ".env.local" ]; then
    echo "⚠️  Warning: .env.local not found locally"
    echo "The deployment will continue, but you may need to create it on the server"
    echo ""
fi

# Deploy .env.local if it exists
if [ -f ".env.local" ]; then
    echo "📄 Uploading .env.local..."
    scp -i ~/.ssh/eb-express-key .env.local ec2-user@$INSTANCE_IP:/home/ec2-user/eb-express/.env.local
    echo "✅ .env.local uploaded"
    echo ""
fi

# Deploy application code
echo "📦 Deploying application code..."
rsync -avz --progress \
    -e "ssh -i ~/.ssh/eb-express-key" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.env' \
    --exclude 'terraform' \
    --exclude '.github' \
    --exclude 'scripts' \
    ./ ec2-user@$INSTANCE_IP:/home/ec2-user/eb-express/

echo ""
echo "📦 Installing dependencies and restarting application..."

# Install dependencies and restart
ssh -i ~/.ssh/eb-express-key ec2-user@$INSTANCE_IP << 'EOF'
    cd /home/ec2-user/eb-express

    # Install production dependencies
    echo "Installing dependencies..."
    npm ci --production

    # Stop existing PM2 processes
    echo "Stopping existing processes..."
    pm2 stop ecosystem.config.cjs || true
    pm2 delete ecosystem.config.cjs || true

    # Start application with PM2
    echo "Starting application..."
    pm2 start ecosystem.config.cjs

    # Save PM2 process list
    pm2 save

    echo ""
    echo "Application status:"
    pm2 status

    echo ""
    echo "Recent logs:"
    pm2 logs --lines 20 --nostream
EOF

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Application URL: http://$INSTANCE_IP:3000"
echo "📊 View logs: ssh -i ~/.ssh/eb-express-key ec2-user@$INSTANCE_IP 'pm2 logs'"
echo "🔄 Restart app: ssh -i ~/.ssh/eb-express-key ec2-user@$INSTANCE_IP 'pm2 restart all'"
