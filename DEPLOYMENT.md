# AWS Deployment Guide with GitHub Actions & Terraform

This guide will help you deploy the eb-express application to AWS EC2 using Terraform and GitHub Actions with OIDC authentication.

## Overview

The deployment infrastructure consists of:

- **EC2 t3.micro instance** running Amazon Linux 2023
- **Elastic IP** for a consistent public IP address
- **Security Groups** for network access control
- **IAM Roles** for EC2 and GitHub Actions OIDC
- **S3 + DynamoDB** for Terraform state management
- **GitHub Actions** for CI/CD with OIDC authentication (no stored AWS credentials!)

## Step-by-Step Setup

### 1. Prerequisites

Install required tools:
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.0

Configure AWS CLI:
```bash
aws configure
```

### 2. Set Up AWS Backend Infrastructure

Run the setup script to create the S3 bucket and DynamoDB table:

```bash
./scripts/setup-aws.sh
```

This creates:
- S3 bucket: `eb-express-terraform-state` (for Terraform state)
- DynamoDB table: `eb-express-terraform-locks` (for state locking)

### 3. Generate SSH Key Pair

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/eb-express-key -N ""
```

This creates:
- Private key: `~/.ssh/eb-express-key`
- Public key: `~/.ssh/eb-express-key.pub`

### 4. Configure Terraform Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and update:

```hcl
github_org = "your-github-username"  # Your GitHub username
ssh_public_key = "ssh-rsa AAAAB3NzaC1yc2E..."  # Contents of ~/.ssh/eb-express-key.pub
```

To get your SSH public key:
```bash
cat ~/.ssh/eb-express-key.pub
```

### 5. Deploy Infrastructure with Terraform

```bash
# Initialize Terraform
terraform init

# Review the planned changes
terraform plan

# Apply the changes
terraform apply
```

**Important:** Note the outputs after `terraform apply`:
- `instance_public_ip`: Your EC2 instance IP
- `oidc_role_arn`: Needed for GitHub Actions

### 6. Configure GitHub Repository Secrets

Go to your GitHub repository:
**Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the following secrets:

#### AWS & Deployment Secrets:
- `AWS_ROLE_ARN`: The ARN from Terraform output `oidc_role_arn`
- `SSH_PRIVATE_KEY`: Contents of `~/.ssh/eb-express-key`
- `SSH_PUBLIC_KEY`: Contents of `~/.ssh/eb-express-key.pub`

To get your SSH private key:
```bash
cat ~/.ssh/eb-express-key
```

#### Application Environment Variables:
- `MONGO_DB_URL`: Your MongoDB connection string
- `API_URL`: Your API URL (e.g., `http://YOUR_IP:3000`)
- `FRONTEND_URL`: Your frontend URL
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `GOOGLE_CALLBACK_URL`: Google OAuth callback URL

### 7. Update Google OAuth Callback

Update your Google OAuth application callback URL to use the new EC2 instance IP:

```
http://<INSTANCE_PUBLIC_IP>:3000/auth/google/callback
```

### 8. Deploy Application

The GitHub Action will automatically deploy when you push to the `main` branch.

Or trigger manually:
1. Go to **Actions** tab in GitHub
2. Select **Deploy to AWS** workflow
3. Click **Run workflow**

## Workflows

### Deploy Workflow (`.github/workflows/deploy.yml`)

Triggers on:
- Push to `main` branch
- Manual workflow dispatch

Steps:
1. **Terraform Infrastructure**: Applies infrastructure changes
2. **Deploy Application**: Deploys code and restarts the app

### Destroy Workflow (`.github/workflows/destroy.yml`)

Triggers on:
- Manual workflow dispatch only
- Requires typing "destroy" to confirm

Use this to tear down all infrastructure when no longer needed.

## Accessing Your Application

### SSH Access
```bash
ssh -i ~/.ssh/eb-express-key ec2-user@<INSTANCE_IP>
```

### View Application Logs
```bash
ssh -i ~/.ssh/eb-express-key ec2-user@<INSTANCE_IP> "pm2 logs"
```

### Check Application Status
```bash
ssh -i ~/.ssh/eb-express-key ec2-user@<INSTANCE_IP> "pm2 status"
```

### Restart Application
```bash
ssh -i ~/.ssh/eb-express-key ec2-user@<INSTANCE_IP> "pm2 restart all"
```

### Access Application
Open your browser to:
```
http://<INSTANCE_IP>:3000
```

## How It Works

### OIDC Authentication

Instead of storing AWS access keys in GitHub, we use OIDC (OpenID Connect):

1. GitHub Actions requests a temporary token from GitHub
2. GitHub provides a JWT token with repository information
3. GitHub Actions exchanges this token with AWS STS
4. AWS validates the token and provides temporary AWS credentials
5. These credentials are used for the deployment (valid for 1 hour)

This is more secure because:
- No long-lived credentials stored in GitHub
- Credentials are temporary and scoped
- AWS validates the GitHub repository making the request

### Deployment Process

1. **Infrastructure Phase** (Terraform):
   - Creates/updates EC2 instance, security groups, IAM roles
   - Provisions Elastic IP for consistent addressing
   - Outputs instance IP for deployment phase

2. **Application Phase** (SSH + rsync):
   - Creates `.env.local` file with secrets on the server
   - Syncs application code to EC2 instance
   - Installs dependencies
   - Restarts application with PM2

### EC2 User Data

On first boot, the EC2 instance:
- Installs Node.js 20.x
- Installs PM2 process manager
- Creates application directory
- Sets up PM2 to start on system boot

## Troubleshooting

### "Permission denied (publickey)" error

Make sure your SSH key is correctly configured:
```bash
chmod 600 ~/.ssh/eb-express-key
ssh -i ~/.ssh/eb-express-key ec2-user@<INSTANCE_IP>
```

### Application not accessible

1. Check if application is running:
   ```bash
   ssh -i ~/.ssh/eb-express-key ec2-user@<INSTANCE_IP> "pm2 status"
   ```

2. Check security group allows port 3000:
   ```bash
   cd terraform
   terraform state show aws_security_group.app_sg
   ```

3. Check application logs:
   ```bash
   ssh -i ~/.ssh/eb-express-key ec2-user@<INSTANCE_IP> "pm2 logs --lines 50"
   ```

### GitHub Actions failing with AWS permission errors

1. Verify `AWS_ROLE_ARN` secret is set correctly
2. Check the IAM role trust policy allows your GitHub repository
3. Ensure all required IAM permissions are attached to the role

### Terraform state locked

If a previous operation failed and locked the state:
```bash
cd terraform
terraform force-unlock <LOCK_ID>
```

## Cost Estimation

Approximate monthly AWS costs:

- **EC2 t3.micro**: ~$7.50/month (730 hours)
- **Elastic IP**: Free while attached to running instance
- **S3**: < $1/month (minimal usage)
- **DynamoDB**: Free tier (< $0.25/month)
- **Data Transfer**: Varies by usage

**Total**: ~$8-10/month

## Updating the Infrastructure

To modify infrastructure:

1. Edit Terraform files in `terraform/` directory
2. Test locally:
   ```bash
   cd terraform
   terraform plan
   terraform apply
   ```
3. Commit and push to GitHub
4. GitHub Actions will apply changes automatically

## Cleaning Up

To destroy all resources:

**Option 1: Via GitHub Actions**
1. Go to **Actions** → **Destroy AWS Infrastructure**
2. Click **Run workflow**
3. Type "destroy" to confirm

**Option 2: Via Terraform CLI**
```bash
cd terraform
terraform destroy
```

**Note:** S3 bucket and DynamoDB table have lifecycle protection and won't be deleted automatically.

## Security Best Practices

1. **Restrict SSH access**: Edit security group to allow SSH only from your IP
2. **Use HTTPS**: Set up SSL/TLS certificate (Let's Encrypt + nginx)
3. **Rotate keys**: Regularly rotate SSH keys and update GitHub secrets
4. **Environment variables**: Never commit `.env.local` or `terraform.tfvars`
5. **Monitor logs**: Enable CloudWatch for application monitoring
6. **Backup**: Regular MongoDB backups
7. **Updates**: Keep Node.js and system packages updated

## Next Steps

- [ ] Set up a custom domain name
- [ ] Configure SSL/TLS with Let's Encrypt
- [ ] Set up nginx as reverse proxy
- [ ] Configure CloudWatch monitoring and alarms
- [ ] Set up automated backups for MongoDB
- [ ] Add health check endpoints
- [ ] Configure log rotation
- [ ] Set up staging environment

## Support

For issues related to:
- **Terraform**: Check [terraform/README.md](terraform/README.md)
- **GitHub Actions**: Check workflow run logs
- **Application**: Check PM2 logs on the server

## Additional Resources

- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [AWS EC2 User Guide](https://docs.aws.amazon.com/ec2/)
