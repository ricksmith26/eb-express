# Migration from EC2 to Elastic Beanstalk

## What Changed

Your deployment has been upgraded from manual EC2/SSM deployment to **AWS Elastic Beanstalk**, which provides:

- ✅ **No more SSM agent issues** - Simple, reliable deployments
- ✅ **Zero-downtime deployments** - Rolling updates built-in
- ✅ **Auto-healing** - Automatic instance replacement if unhealthy
- ✅ **Easy scaling** - Just change instance count or enable auto-scaling
- ✅ **Built-in monitoring** - CloudWatch logs and metrics integrated
- ✅ **Same cost** - Still uses t3.micro instances

## Migration Steps

### Step 1: Destroy Old EC2 Infrastructure

```bash
cd terraform

# This will destroy the EC2 instance, EIP, and old DNS records
terraform destroy -target=aws_instance.app \
                 -target=aws_eip.app_eip \
                 -target=aws_route53_record.api \
                 -target=aws_route53_record.root \
                 -target=aws_route53_record.www \
                 -target=aws_security_group.app_sg

# Answer 'yes' when prompted
```

### Step 2: Reconfigure Terraform for EB

```bash
# Remove old state references
terraform init -reconfigure

# Validate the new configuration
terraform validate

# Plan the EB deployment
terraform plan
```

### Step 3: Apply EB Infrastructure

```bash
# Create the Elastic Beanstalk environment
terraform apply

# This creates:
# - EB Application
# - EB Environment with Node.js 20
# - S3 bucket for app versions
# - IAM roles
# - Route53 DNS pointing to EB
```

### Step 4: Update GitHub Workflow

The deployment is now handled by `.github/workflows/deploy-eb.yml` (already created).

**Rename the old workflow:**
```bash
mv .github/workflows/deploy.yml .github/workflows/deploy-old.yml.backup
```

### Step 5: First Deployment

After Terraform applies successfully:

```bash
# Push your changes
git add .
git commit -m "Migrate to Elastic Beanstalk"
git push

# The GitHub Action will automatically:
# 1. Run terraform apply
# 2. Package your app
# 3. Upload to EB
# 4. Deploy with zero downtime
```

## New Deployment Process

### Automatic (Recommended)
Just push to main:
```bash
git push origin main
```

### Manual
```bash
# Create deployment package
zip -r deploy.zip . -x "*node_modules*" "*terraform*" "*.git*"

# Deploy via AWS CLI
eb deploy eb-express-production
```

## Configuration Files Created

1. **`.ebextensions/01_nodejs.config`** - Node.js and app settings
2. **`.ebextensions/02_nginx.config`** - WebSocket support for Socket.IO
3. **`.ebextensions/03_envvars.config`** - Environment variable documentation
4. **`.ebignore`** - Files to exclude from deployment
5. **`.github/workflows/deploy-eb.yml`** - New deployment workflow
6. **`terraform/elastic-beanstalk.tf`** - EB infrastructure

## Environment Variables

All your environment variables are configured in the GitHub Actions workflow and will be deployed automatically:

- NODE_ENV
- PORT (8080 for EB)
- MONGO_DB_URL
- API_URL
- FRONTEND_URL
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_CALLBACK_URL
- JWT_SECRET
- JWT_REFRESH_SECRET
- LIVEKIT_URL
- LIVEKIT_API_KEY
- LIVEKIT_API_SECRET

## Monitoring & Logs

```bash
# View environment health
aws elasticbeanstalk describe-environment-health \
  --environment-name eb-express-production \
  --attribute-names All \
  --region eu-west-2

# View recent logs
aws elasticbeanstalk retrieve-environment-info \
  --environment-name eb-express-production \
  --info-type tail \
  --region eu-west-2

# Stream logs (requires EB CLI)
eb logs --stream
```

## Rollback

If you need to rollback to a previous version:

```bash
# List versions
aws elasticbeanstalk describe-application-versions \
  --application-name eb-express \
  --region eu-west-2

# Deploy specific version
aws elasticbeanstalk update-environment \
  --environment-name eb-express-production \
  --version-label VERSION_LABEL_HERE \
  --region eu-west-2
```

## Cost Comparison

**Old setup (EC2):**
- t3.micro instance: ~$7.50/month
- Elastic IP: ~$3.65/month (if not attached)
- **Total: ~$7.50-11/month**

**New setup (Elastic Beanstalk):**
- t3.micro instance: ~$7.50/month
- EB management: **FREE** (no additional charge)
- S3 storage (minimal): ~$0.50/month
- **Total: ~$8/month**

*Same cost, much better reliability!*

## Troubleshooting

### Deployment fails with health check errors
Check your app responds on port 8080:
```javascript
const PORT = process.env.PORT || 8080;
```

### Environment stuck in "Updating"
```bash
# Check environment events
aws elasticbeanstalk describe-events \
  --environment-name eb-express-production \
  --max-items 20 \
  --region eu-west-2
```

### Need to SSH into instance
```bash
# EB CLI method (recommended)
eb ssh

# Or using session manager (no key needed)
aws ssm start-session --target <instance-id>
```

## Questions?

- **EB Dashboard**: https://console.aws.amazon.com/elasticbeanstalk
- **EB CLI Docs**: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3.html
- **Your API**: https://api.brigid-personal-assistant.com
