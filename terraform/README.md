# Terraform AWS Deployment

This directory contains Terraform configuration to deploy the eb-express application to AWS EC2.

## Architecture

- **EC2 Instance**: t3.micro instance running Amazon Linux 2023
- **Security Group**: Allows HTTP (80), HTTPS (443), SSH (22), and application port (3000)
- **Elastic IP**: Static IP address for the instance
- **IAM Roles**: EC2 instance role and GitHub Actions OIDC role
- **S3 Backend**: Remote state storage with versioning and encryption
- **DynamoDB**: State locking table

## Prerequisites

1. AWS CLI installed and configured
2. Terraform >= 1.0 installed
3. GitHub repository set up
4. SSH key pair generated

## Initial Setup

### 1. Create AWS Backend Infrastructure

Run the setup script to create the S3 bucket and DynamoDB table for Terraform state:

```bash
cd ..
./scripts/setup-aws.sh
```

This will create:
- S3 bucket: `eb-express-terraform-state`
- DynamoDB table: `eb-express-terraform-locks`

### 2. Generate SSH Key Pair

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/eb-express-key -N ""
```

### 3. Configure Terraform Variables

Copy the example variables file:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and fill in:
- `github_org`: Your GitHub username or organization
- `ssh_public_key`: Contents of `~/.ssh/eb-express-key.pub`

### 4. Initialize Terraform

```bash
cd terraform
terraform init
```

### 5. Review and Apply

```bash
terraform plan
terraform apply
```

## GitHub Actions Setup

### 1. Set Up OIDC

After running `terraform apply`, note the output `oidc_role_arn`. You'll need this for GitHub Actions.

### 2. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

**Required Secrets:**
- `AWS_ROLE_ARN`: The ARN from Terraform output `oidc_role_arn`
- `SSH_PRIVATE_KEY`: Contents of `~/.ssh/eb-express-key.pem`
- `SSH_PUBLIC_KEY`: Contents of `~/.ssh/eb-express-key.pub`

**Application Secrets:**
- `MONGO_DB_URL`: Your MongoDB connection string
- `API_URL`: Your API URL
- `FRONTEND_URL`: Your frontend URL
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `GOOGLE_CALLBACK_URL`: Google OAuth callback URL

### 3. Trigger Deployment

The GitHub Action will run automatically on:
- Push to `main` branch
- Manual workflow dispatch

## Manual Deployment

If you want to deploy manually without GitHub Actions:

```bash
# Get the instance IP
terraform output instance_public_ip

# SSH into the instance
ssh -i ~/.ssh/eb-express-key.pem ec2-user@<INSTANCE_IP>

# Deploy using rsync (from project root)
rsync -avz -e "ssh -i ~/.ssh/eb-express-key.pem" \
  --exclude 'node_modules' --exclude '.git' \
  ./ ec2-user@<INSTANCE_IP>:/home/ec2-user/eb-express/
```

## Useful Commands

```bash
# Show outputs
terraform output

# SSH to instance
ssh -i ~/.ssh/eb-express-key.pem ec2-user@$(terraform output -raw instance_public_ip)

# View PM2 logs
ssh -i ~/.ssh/eb-express-key.pem ec2-user@$(terraform output -raw instance_public_ip) "pm2 logs"

# Restart application
ssh -i ~/.ssh/eb-express-key.pem ec2-user@$(terraform output -raw instance_public_ip) "pm2 restart all"

# Check application status
ssh -i ~/.ssh/eb-express-key.pem ec2-user@$(terraform output -raw instance_public_ip) "pm2 status"
```

## Destroying Infrastructure

To destroy all resources:

```bash
terraform destroy
```

Or use the GitHub Actions workflow "Destroy AWS Infrastructure" (requires manual confirmation).

**Note:** The S3 bucket and DynamoDB table have `prevent_destroy` lifecycle rules and won't be deleted.

## Troubleshooting

### Instance not accessible

1. Check security group rules:
   ```bash
   terraform state show aws_security_group.app_sg
   ```

2. Verify instance is running:
   ```bash
   aws ec2 describe-instances --instance-ids $(terraform output -raw instance_id)
   ```

### Application not starting

1. SSH into instance and check logs:
   ```bash
   ssh -i ~/.ssh/eb-express-key.pem ec2-user@$(terraform output -raw instance_public_ip)
   pm2 logs
   ```

2. Check user data execution:
   ```bash
   cat /var/log/cloud-init-output.log
   ```

### Terraform state locked

If state is locked due to a failed operation:

```bash
terraform force-unlock <LOCK_ID>
```

## Security Notes

- Never commit `terraform.tfvars` or any `.tfstate` files to Git
- Restrict SSH access to your IP in the security group
- Rotate SSH keys regularly
- Use AWS Secrets Manager for sensitive application secrets
- Enable CloudTrail for audit logging
