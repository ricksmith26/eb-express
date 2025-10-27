#!/bin/bash

# This script sets up GitHub OIDC authentication for AWS
# Run this once to create the necessary AWS resources

REPO_OWNER="ricksmith26"
REPO_NAME="eb-express"
AWS_REGION="eu-west-2"
ROLE_NAME="GitHubActionsDeployRole"

echo "Setting up GitHub OIDC for AWS..."

# 1. Create OIDC provider for GitHub (if it doesn't exist)
echo "Creating OIDC provider..."
OIDC_PROVIDER_ARN=$(aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')].Arn" --output text)

if [ -z "$OIDC_PROVIDER_ARN" ]; then
  OIDC_PROVIDER_ARN=$(aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd \
    --query 'OpenIDConnectProviderArn' \
    --output text)
  echo "Created OIDC provider: $OIDC_PROVIDER_ARN"
else
  echo "OIDC provider already exists: $OIDC_PROVIDER_ARN"
fi

# 2. Create trust policy
cat > /tmp/github-trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "$OIDC_PROVIDER_ARN"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${REPO_OWNER}/${REPO_NAME}:ref:refs/heads/main"
        }
      }
    }
  ]
}
EOF

# 3. Create IAM role
echo "Creating IAM role..."
ROLE_ARN=$(aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document file:///tmp/github-trust-policy.json \
  --query 'Role.Arn' \
  --output text 2>/dev/null)

if [ $? -ne 0 ]; then
  # Role might already exist, get its ARN
  ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text 2>/dev/null)
  if [ $? -eq 0 ]; then
    echo "Role already exists: $ROLE_ARN"
    echo "Updating trust policy..."
    aws iam update-assume-role-policy \
      --role-name $ROLE_NAME \
      --policy-document file:///tmp/github-trust-policy.json
  else
    echo "Error creating or retrieving role"
    exit 1
  fi
else
  echo "Created role: $ROLE_ARN"
fi

# 4. Create and attach policy for Elastic Beanstalk deployment
cat > /tmp/eb-deploy-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "elasticbeanstalk:*",
        "ec2:*",
        "s3:*",
        "cloudformation:*",
        "autoscaling:*",
        "elasticloadbalancing:*",
        "rds:*",
        "cloudwatch:*",
        "logs:*",
        "sns:*",
        "sqs:*",
        "iam:PassRole",
        "iam:GetRole"
      ],
      "Resource": "*"
    }
  ]
}
EOF

echo "Creating/updating deployment policy..."
aws iam put-role-policy \
  --role-name $ROLE_NAME \
  --policy-name EBDeploymentPolicy \
  --policy-document file:///tmp/eb-deploy-policy.json

echo ""
echo "✅ Setup complete!"
echo ""
echo "Add this to your GitHub repository secrets:"
echo "AWS_ROLE_ARN = $ROLE_ARN"
echo ""
echo "Go to: https://github.com/${REPO_OWNER}/${REPO_NAME}/settings/secrets/actions"

# Cleanup
rm /tmp/github-trust-policy.json /tmp/eb-deploy-policy.json
