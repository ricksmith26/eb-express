#!/bin/bash

# Cleanup and Setup Script for Elastic Beanstalk
# This script will clean up old EB resources and set up a fresh environment

set -e  # Exit on error

REGION="eu-west-2"

echo "=========================================="
echo "EB Cleanup and Fresh Setup Script"
echo "=========================================="
echo ""

# Step 1: Wait for environments to terminate
echo "Step 1: Checking if environments are terminated..."
while true; do
  ENV_COUNT=$(aws elasticbeanstalk describe-environments --region $REGION --query 'length(Environments)' --output text 2>/dev/null || echo "0")

  if [ "$ENV_COUNT" = "0" ]; then
    echo "✅ All environments terminated"
    break
  else
    echo "⏳ $ENV_COUNT environment(s) still terminating... (checking again in 30s)"
    sleep 30
  fi
done

echo ""

# Step 2: Delete applications
echo "Step 2: Deleting old applications..."

for APP in "brigid-api" "eb-express" "eb-express-new"; do
  echo "Deleting application: $APP"
  aws elasticbeanstalk delete-application \
    --application-name $APP \
    --region $REGION \
    --terminate-env-by-force 2>/dev/null || echo "  (Application $APP may not exist or already deleted)"
done

echo "✅ Applications deleted"
echo ""

# Step 3: Wait a bit for cleanup
echo "Step 3: Waiting for cleanup to complete..."
sleep 10

echo ""

# Step 4: Initialize new EB application
echo "Step 4: Initializing new EB application..."
echo ""
echo "Please answer the following prompts:"
echo "  1. Application name: brigid-api"
echo "  2. Platform: Node.js"
echo "  3. Platform branch: Node.js 20 running on 64bit Amazon Linux 2023"
echo "  4. CodeCommit: NO (type 'n')"
echo "  5. SSH: YES (type 'y')"
echo "  6. Keypair: Select existing or create new"
echo ""

eb init --region $REGION

echo ""
echo "=========================================="
echo "✅ EB Application initialized!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Create production environment:"
echo "   eb create brigid-api-prod --single --instance-type t3.micro"
echo ""
echo "2. Set environment variables (see README.md for full list):"
echo "   eb setenv NODE_ENV=production PORT=8080 MONGO_DB_URL=... API_URL=... ..."
echo ""
echo "3. Deploy your application:"
echo "   eb deploy"
echo ""
