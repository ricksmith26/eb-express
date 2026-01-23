# EB Express API

Backend API for Brigid Personal Assistant, deployed on AWS Elastic Beanstalk.

## Production URLs

- **API**: https://api.brigid-personal-assistant.com
- **Frontend**: https://brigid-personal-assistant.com

## Tech Stack

- Node.js 20
- Express.js
- MongoDB (Atlas)
- AWS Elastic Beanstalk (Single Instance)
- Nginx with Let's Encrypt SSL
- Socket.IO for WebSocket connections
- Google OAuth 2.0
- LiveKit for video/audio

## Deployment

### Regular Deployment (Code Changes)

For day-to-day code changes, simply run:

```bash
~/.local/bin/eb deploy
```

Or use the npm script:

```bash
npm run deploy
```

This automatically deploys:
- ✅ All code changes
- ✅ HTTPS configuration with SSL certificate renewal
- ✅ Environment variables (already configured)
- ✅ Nginx WebSocket configuration

**Deployment takes approximately 1-2 minutes.**

### Environment Variables

Environment variables are stored in AWS Elastic Beanstalk configuration and persist across deployments.

#### Current Environment Variables

- `NODE_ENV=production`
- `PORT=8080`
- `FRONTEND_URL=https://brigid-personal-assistant.com`
- `API_URL=https://api.brigid-personal-assistant.com`
- `MONGO_DB_URL` - MongoDB Atlas connection string
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GOOGLE_CALLBACK_URL=https://api.brigid-personal-assistant.com/auth/google/callback`
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - JWT refresh token secret
- `LIVEKIT_API_KEY` - LiveKit API key
- `LIVEKIT_API_SECRET` - LiveKit API secret
- `LIVEKIT_URL=wss://brigid-pi-u49mm2ww.livekit.cloud`

#### Updating Environment Variables

You only need to update environment variables when changing configuration (not code).

**Option 1: AWS CLI** (Recommended - fastest)
```bash
aws elasticbeanstalk update-environment \
  --environment-name brigid-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=VARIABLE_NAME,Value="new_value"
```

**Option 2: EB CLI**
```bash
~/.local/bin/eb setenv VARIABLE_NAME="new_value"
```

**Option 3: AWS Console**
1. Go to AWS Elastic Beanstalk Console
2. Select `brigid-api-prod` environment
3. Configuration → Software → Edit
4. Update Environment properties
5. Apply

### First Time Setup

If you need to set up a new environment from scratch:

1. **Install EB CLI**
   ```bash
   pip install awsebcli
   ```

2. **Initialize EB**
   ```bash
   ~/.local/bin/eb init -p "Node.js 20" brigid-api --region eu-west-2
   ```

3. **Create Environment**
   ```bash
   ~/.local/bin/eb create brigid-api-prod --single --instance-type t3.micro
   ```

4. **Set Environment Variables** (use one of the methods above)

5. **Deploy**
   ```bash
   ~/.local/bin/eb deploy
   ```

## HTTPS/SSL Configuration

HTTPS is automatically configured using Let's Encrypt SSL certificates.

### How it works:
- `.ebextensions/05_https.config` installs and configures certbot
- `.platform/nginx/conf.d/https.conf` configures nginx for HTTPS on port 443
- Certificates auto-renew before expiration
- WebSocket connections are supported over HTTPS

### Manual SSL Certificate Renewal (if needed)

SSH into the instance and run:
```bash
eb ssh
sudo certbot renew
sudo systemctl reload nginx
```

## Monitoring

### Check Environment Status
```bash
~/.local/bin/eb status
```

### View Logs
```bash
~/.local/bin/eb logs
```

### SSH into Instance
```bash
~/.local/bin/eb ssh
```

### Monitor Health
```bash
~/.local/bin/eb health --refresh
```

## Project Structure

```
.
├── .ebextensions/          # EB configuration files
│   ├── 01_nodejs.config    # Node.js settings
│   ├── 02_nginx.config     # Nginx base configuration
│   ├── 03_envvars.config   # Environment variables (reference only)
│   ├── 04_logging.config   # CloudWatch logging
│   └── 05_https.config     # SSL/HTTPS setup with certbot
├── .platform/
│   └── nginx/
│       └── conf.d/
│           └── https.conf  # HTTPS nginx configuration
├── controllers/            # API controllers
├── routes/                 # Express routes
├── models/                 # MongoDB models
├── agenda/                 # Job scheduling
├── config/                 # Configuration files
└── bin/www                 # Application entry point
```

## Important Notes

### Case Sensitivity
Controller imports are **case-sensitive** on Linux (production). Always use lowercase with hyphens:
- ✅ `import TokenController from './token-controller.js'`
- ❌ `import TokenController from './TokenController.js'`

### Environment Type
The production environment is **Single Instance** (not Load Balanced):
- No auto-scaling
- No load balancer
- SSL is handled directly on the nginx instance
- Cost-effective for low-traffic applications

### DNS Configuration
The custom domain `api.brigid-personal-assistant.com` is configured via Route53 CNAME:
```
api.brigid-personal-assistant.com → brigid-api-prod.eba-thgvfr9n.eu-west-2.elasticbeanstalk.com
```

## Troubleshooting

### Deployment Fails
```bash
# Check recent events
~/.local/bin/eb events --follow

# View logs
~/.local/bin/eb logs --all
```

### HTTPS Not Working
```bash
# SSH into instance and check certificate
~/.local/bin/eb ssh
sudo ls -la /etc/letsencrypt/live/api.brigid-personal-assistant.com/
sudo nginx -t
sudo systemctl status nginx
```

### Application Crashes
```bash
# Check application logs
~/.local/bin/eb ssh
sudo tail -f /var/log/web.stdout.log
```

### Environment Variables Not Applied
Environment variables are set at the EB environment level, not in `.ebextensions/03_envvars.config`. Use AWS CLI or Console to update them.

## Development

### Local Development
```bash
# Install dependencies
npm install

# Copy and configure local environment
cp .env.local.example .env.local
# Edit .env.local with your local settings

# Start development server
npm start
```

Local server runs on: http://localhost:3000

## AWS S3 Configuration

### Call Recordings Bucket

Call recordings are stored in the `brigid-call-recordings` S3 bucket (eu-west-2).

#### CORS Configuration

CORS must be configured on the bucket to allow audio playback from the admin portal:

```bash
aws s3api put-bucket-cors --bucket brigid-call-recordings --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedOrigins": [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://admin.brigid-personal-assistant.com"
      ],
      "ExposeHeaders": ["Content-Length", "Content-Type"],
      "MaxAgeSeconds": 3600
    }
  ]
}'
```

To verify CORS configuration:
```bash
aws s3api get-bucket-cors --bucket brigid-call-recordings
```

**Note**: When deploying the admin portal to production, add the production URL to `AllowedOrigins`.

## Security Notes

- Environment variables containing secrets are stored in AWS Elastic Beanstalk (encrypted at rest)
- SSL/TLS certificates are managed by Let's Encrypt
- MongoDB credentials use restricted access
- CORS is configured to only allow requests from `FRONTEND_URL`

## Known Issues

### Session Persistence After Server Restart
Users are logged out when the server restarts because sessions are stored in memory using express-session with in-memory store.

**Solutions:**
1. Use connect-mongo to store sessions in MongoDB (recommended)
2. Use Redis/Memcached for session storage
3. Switch to stateless JWT-only authentication

## Additional Documentation

- **Call History Feature**: See [docs/call-history.md](docs/call-history.md) for WebRTC call tracking implementation
- **Archived Deployment Docs**: See `docs/` directory for historical deployment guides

## Support

For issues or questions:
- Check AWS Elastic Beanstalk logs: `~/.local/bin/eb logs`
- Check CloudWatch Logs in AWS Console
- SSH into instance for debugging: `~/.local/bin/eb ssh`
