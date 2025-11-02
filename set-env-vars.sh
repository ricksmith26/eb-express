#!/bin/bash

# Set Environment Variables for Elastic Beanstalk
# Run this script after creating your environment

set -e

echo "=========================================="
echo "Setting Environment Variables"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found!"
  echo "Please create .env with your environment variables first."
  exit 1
fi

# Source the .env file and export variables
set -a
source .env
set +a

echo "Setting environment variables for brigid-api-prod..."
echo ""

# Update Google callback URL to use API domain
GOOGLE_CALLBACK_URL="https://api.brigid-personal-assistant.com/auth/google/callback"

~/.local/bin/eb setenv \
  NODE_ENV=production \
  PORT=8080 \
  MONGO_DB_URL="$MONGO_DB_URL" \
  API_URL="$API_URL" \
  FRONTEND_URL="$FRONTEND_URL" \
  GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  GOOGLE_CALLBACK_URL="$GOOGLE_CALLBACK_URL" \
  JWT_SECRET="$JWT_SECRET" \
  JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
  LIVEKIT_URL="$LIVEKIT_URL" \
  LIVEKIT_API_KEY="$LIVEKIT_API_KEY" \
  LIVEKIT_API_SECRET="$LIVEKIT_API_SECRET"

echo ""
echo "✅ Environment variables set successfully!"
echo ""
echo "Next step: Deploy your application"
echo "  ~/.local/bin/eb deploy"
