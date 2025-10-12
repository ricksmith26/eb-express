#!/bin/bash
set -e

# Script to set up AWS backend infrastructure for Terraform
# Run this ONCE before using Terraform

echo "🚀 Setting up AWS infrastructure for Terraform..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    echo "Visit: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials are not configured. Please run 'aws configure' first."
    exit 1
fi

echo "✅ AWS CLI is configured"

# Set region
AWS_REGION="eu-west-2"

echo "📦 Creating S3 bucket for Terraform state..."
aws s3api create-bucket \
    --bucket eb-express-terraform-state \
    --region $AWS_REGION \
    --create-bucket-configuration LocationConstraint=$AWS_REGION \
    || echo "Bucket might already exist, continuing..."

echo "🔒 Enabling versioning on S3 bucket..."
aws s3api put-bucket-versioning \
    --bucket eb-express-terraform-state \
    --versioning-configuration Status=Enabled

echo "🔐 Enabling encryption on S3 bucket..."
aws s3api put-bucket-encryption \
    --bucket eb-express-terraform-state \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            }
        }]
    }'

echo "🚫 Blocking public access to S3 bucket..."
aws s3api put-public-access-block \
    --bucket eb-express-terraform-state \
    --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "📊 Creating DynamoDB table for state locking..."
aws dynamodb create-table \
    --table-name eb-express-terraform-locks \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region $AWS_REGION \
    || echo "Table might already exist, continuing..."

echo "✅ AWS backend infrastructure setup complete!"
echo ""
echo "Next steps:"
echo "1. Generate SSH key pair: ssh-keygen -t rsa -b 4096 -f ~/.ssh/eb-express-key"
echo "2. Copy terraform/terraform.tfvars.example to terraform/terraform.tfvars"
echo "3. Fill in the values in terraform/terraform.tfvars"
echo "4. Run: cd terraform && terraform init"
echo "5. Run: terraform plan"
echo "6. Run: terraform apply"
