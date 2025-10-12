# Quick Start Guide

## First-Time Setup (5 steps)

### 1. Create AWS Backend
```bash
./scripts/setup-aws.sh
```

### 2. Generate SSH Key
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/eb-express-key -N ""
```

### 3. Configure Terraform
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars and add your github_org and ssh_public_key
```

Get your SSH public key:
```bash
cat ~/.ssh/eb-express-key.pub
```

### 4. Deploy Infrastructure
```bash
terraform init
terraform plan
terraform apply
```

Save the outputs:
- `instance_public_ip`: Your server IP
- `oidc_role_arn`: For GitHub Actions

### 5. Configure GitHub Secrets

Add to GitHub → Settings → Secrets → Actions:

**Required:**
- `AWS_ROLE_ARN` = (from Terraform output)
- `SSH_PRIVATE_KEY` = (run: `cat ~/.ssh/eb-express-key`)
- `SSH_PUBLIC_KEY` = (run: `cat ~/.ssh/eb-express-key.pub`)

**App Config:**
- `MONGO_DB_URL`
- `API_URL`
- `FRONTEND_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

## Daily Usage

### Deploy via GitHub Actions
Push to `main` branch or run workflow manually

### Deploy Manually
```bash
./scripts/deploy-manual.sh
```

### SSH to Server
```bash
ssh -i ~/.ssh/eb-express-key ec2-user@YOUR_IP
```

### View Logs
```bash
ssh -i ~/.ssh/eb-express-key ec2-user@YOUR_IP "pm2 logs"
```

### Restart App
```bash
ssh -i ~/.ssh/eb-express-key ec2-user@YOUR_IP "pm2 restart all"
```

### Check Status
```bash
ssh -i ~/.ssh/eb-express-key ec2-user@YOUR_IP "pm2 status"
```

## Useful Commands

```bash
# Get instance IP
cd terraform && terraform output instance_public_ip

# Update infrastructure
cd terraform && terraform plan && terraform apply

# Destroy everything
cd terraform && terraform destroy

# View Terraform state
cd terraform && terraform show
```

## Troubleshooting

**Can't SSH:** Check security group allows your IP
**App not working:** Check `pm2 logs` on server
**Terraform locked:** Run `terraform force-unlock <LOCK_ID>`
**GitHub Actions failing:** Check AWS_ROLE_ARN secret is correct

## File Structure

```
eb-express/
├── .github/workflows/
│   ├── deploy.yml          # Auto-deploy on push to main
│   └── destroy.yml         # Destroy infrastructure (manual)
├── terraform/
│   ├── main.tf             # EC2, security groups, IAM
│   ├── github-oidc.tf      # GitHub Actions OIDC setup
│   ├── variables.tf        # Input variables
│   ├── outputs.tf          # Output values
│   ├── user_data.sh        # EC2 initialization script
│   ├── backend-setup.tf    # S3 + DynamoDB setup
│   └── terraform.tfvars    # Your values (not committed)
├── scripts/
│   ├── setup-aws.sh        # Create S3 & DynamoDB
│   └── deploy-manual.sh    # Manual deployment script
├── DEPLOYMENT.md           # Full deployment guide
└── QUICK_START.md          # This file
```

## What Gets Deployed

- **t3.micro EC2** (Amazon Linux 2023)
- **Node.js 20.x** with PM2
- **Elastic IP** (static IP address)
- **Security Groups** (ports 22, 80, 443, 3000)
- **IAM Roles** (EC2 + GitHub OIDC)

## Cost: ~$8-10/month

For full details, see [DEPLOYMENT.md](DEPLOYMENT.md)
