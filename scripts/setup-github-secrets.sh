#!/bin/bash
set -e

echo "🔑 GitHub Secrets Setup Helper"
echo "================================"
echo ""

# Get the repository info
REPO_OWNER="ricksmith26"
REPO_NAME="eb-express"

echo "Repository: $REPO_OWNER/$REPO_NAME"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI is authenticated"
echo ""

# Get AWS role ARN from Terraform
cd terraform
AWS_ROLE_ARN=$(terraform output -raw oidc_role_arn 2>/dev/null || echo "")
cd ..

if [ -z "$AWS_ROLE_ARN" ]; then
    echo "⚠️  Could not get AWS_ROLE_ARN from Terraform output"
    echo "You'll need to add it manually from: cd terraform && terraform output oidc_role_arn"
else
    echo "Setting AWS_ROLE_ARN secret..."
    echo "$AWS_ROLE_ARN" | gh secret set AWS_ROLE_ARN -R "$REPO_OWNER/$REPO_NAME"
    echo "✅ AWS_ROLE_ARN set"
fi

echo ""

# SSH Keys
if [ -f ~/.ssh/eb-express-key ]; then
    echo "Setting SSH_PRIVATE_KEY secret..."
    gh secret set SSH_PRIVATE_KEY -R "$REPO_OWNER/$REPO_NAME" < ~/.ssh/eb-express-key
    echo "✅ SSH_PRIVATE_KEY set"
else
    echo "⚠️  ~/.ssh/eb-express-key not found. Skipping SSH_PRIVATE_KEY."
fi

echo ""

if [ -f ~/.ssh/eb-express-key.pub ]; then
    echo "Setting SSH_PUBLIC_KEY secret..."
    gh secret set SSH_PUBLIC_KEY -R "$REPO_OWNER/$REPO_NAME" < ~/.ssh/eb-express-key.pub
    echo "✅ SSH_PUBLIC_KEY set"
    echo ""
    echo "📋 Public key content:"
    cat ~/.ssh/eb-express-key.pub
else
    echo "⚠️  ~/.ssh/eb-express-key.pub not found. Skipping SSH_PUBLIC_KEY."
fi

echo ""
echo "================================"
echo "Now add your application secrets manually:"
echo ""
echo "gh secret set MONGO_DB_URL -R $REPO_OWNER/$REPO_NAME"
echo "gh secret set API_URL -R $REPO_OWNER/$REPO_NAME"
echo "gh secret set FRONTEND_URL -R $REPO_OWNER/$REPO_NAME"
echo "gh secret set GOOGLE_CLIENT_ID -R $REPO_OWNER/$REPO_NAME"
echo "gh secret set GOOGLE_CLIENT_SECRET -R $REPO_OWNER/$REPO_NAME"
echo "gh secret set GOOGLE_CALLBACK_URL -R $REPO_OWNER/$REPO_NAME"
echo ""
echo "Or set them interactively (you'll be prompted for values):"
echo ""
echo "gh secret set MONGO_DB_URL -R $REPO_OWNER/$REPO_NAME --body 'your-mongo-url'"
echo ""
echo "View all secrets: gh secret list -R $REPO_OWNER/$REPO_NAME"
