# Data sources
data "aws_vpc" "default" {
  default = true
}

data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

data "aws_caller_identity" "current" {}

# SSH Key Pair
resource "aws_key_pair" "app_key" {
  key_name   = "${var.app_name}-key"
  public_key = var.ssh_public_key

  tags = {
    Name        = "${var.app_name}-key"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  lifecycle {
    ignore_changes = [public_key]
  }
}

# Elastic Beanstalk Application
resource "aws_elastic_beanstalk_application" "app" {
  name        = var.app_name
  description = "Express.js application deployed via Elastic Beanstalk"

  tags = {
    Name        = var.app_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Elastic Beanstalk Application Version (placeholder - will be updated by CI/CD)
resource "aws_elastic_beanstalk_application_version" "initial" {
  name        = "${var.app_name}-initial"
  application = aws_elastic_beanstalk_application.app.name
  description = "Initial version"
  bucket      = aws_s3_bucket.app_versions.id
  key         = aws_s3_object.initial_version.id

  tags = {
    Name        = "${var.app_name}-initial"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# S3 bucket for application versions
resource "aws_s3_bucket" "app_versions" {
  bucket = "${var.app_name}-versions-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "${var.app_name}-versions"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# S3 bucket versioning
resource "aws_s3_bucket_versioning" "app_versions" {
  bucket = aws_s3_bucket.app_versions.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Initial placeholder application (empty Node.js app)
resource "aws_s3_object" "initial_version" {
  bucket = aws_s3_bucket.app_versions.id
  key    = "initial-app.zip"
  source = "${path.module}/initial-app.zip"
  etag   = filemd5("${path.module}/initial-app.zip")

  tags = {
    Name        = "${var.app_name}-initial"
    Environment = var.environment
  }
}

# IAM role for Elastic Beanstalk service
resource "aws_iam_role" "eb_service_role" {
  name = "${var.app_name}-eb-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "elasticbeanstalk.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.app_name}-eb-service-role"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Attach managed policies to EB service role
resource "aws_iam_role_policy_attachment" "eb_service_health" {
  role       = aws_iam_role.eb_service_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth"
}

resource "aws_iam_role_policy_attachment" "eb_service" {
  role       = aws_iam_role.eb_service_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService"
}

# IAM role for EC2 instances
resource "aws_iam_role" "eb_ec2_role" {
  name = "${var.app_name}-eb-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.app_name}-eb-ec2-role"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Attach managed policies to EC2 role
resource "aws_iam_role_policy_attachment" "eb_web_tier" {
  role       = aws_iam_role.eb_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier"
}

resource "aws_iam_role_policy_attachment" "eb_worker_tier" {
  role       = aws_iam_role.eb_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier"
}

resource "aws_iam_role_policy_attachment" "eb_multicontainer_docker" {
  role       = aws_iam_role.eb_ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker"
}

# Custom policy for S3 access to deployment bucket
resource "aws_iam_role_policy" "eb_s3_access" {
  name = "${var.app_name}-eb-s3-access"
  role = aws_iam_role.eb_ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.app_versions.arn,
          "${aws_s3_bucket.app_versions.arn}/*"
        ]
      }
    ]
  })
}

# IAM instance profile
resource "aws_iam_instance_profile" "eb_ec2_profile" {
  name = "${var.app_name}-eb-ec2-profile"
  role = aws_iam_role.eb_ec2_role.name

  tags = {
    Name        = "${var.app_name}-eb-ec2-profile"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Elastic Beanstalk Environment
resource "aws_elastic_beanstalk_environment" "app_env" {
  name                = "${var.app_name}-${var.environment}"
  application         = aws_elastic_beanstalk_application.app.name
  solution_stack_name = "64bit Amazon Linux 2023 v6.6.6 running Node.js 20"
  tier                = "WebServer"
  version_label       = aws_elastic_beanstalk_application_version.initial.name

  # Environment settings
  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "SingleInstance" # Use "LoadBalanced" for production with auto-scaling
  }

  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "ServiceRole"
    value     = aws_iam_role.eb_service_role.name
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    value     = aws_iam_instance_profile.eb_ec2_profile.name
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "InstanceType"
    value     = var.instance_type
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "EC2KeyName"
    value     = aws_key_pair.app_key.key_name
  }

  # VPC settings (using default VPC)
  setting {
    namespace = "aws:ec2:vpc"
    name      = "VPCId"
    value     = data.aws_vpc.default.id
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "Subnets"
    value     = join(",", data.aws_subnets.default.ids)
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "AssociatePublicIpAddress"
    value     = "true"
  }

  # Environment variables
  # Note: Node.js settings are configured in .ebextensions/01_nodejs.config
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "NODE_ENV"
    value     = var.environment
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "PORT"
    value     = "8080" # EB uses 8080 by default
  }

  # Enhanced health reporting
  setting {
    namespace = "aws:elasticbeanstalk:healthreporting:system"
    name      = "SystemType"
    value     = "enhanced"
  }

  # CloudWatch Logs
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "StreamLogs"
    value     = "true"
  }

  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "DeleteOnTerminate"
    value     = "false"
  }

  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "RetentionInDays"
    value     = "7"
  }

  # Deployment settings
  setting {
    namespace = "aws:elasticbeanstalk:command"
    name      = "DeploymentPolicy"
    value     = "AllAtOnce" # Change to "Rolling" or "Immutable" for production
  }

  setting {
    namespace = "aws:elasticbeanstalk:command"
    name      = "Timeout"
    value     = "600"
  }

  # Managed updates
  setting {
    namespace = "aws:elasticbeanstalk:managedactions"
    name      = "ManagedActionsEnabled"
    value     = "false" # Enable for automatic platform updates
  }

  tags = {
    Name        = "${var.app_name}-${var.environment}"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  lifecycle {
    create_before_destroy = true
    # Don't recreate environment on version changes - EB handles rolling updates
    ignore_changes = [
      version_label,
    ]
  }
}

# Get default subnets
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Route53 DNS record for api subdomain pointing to EB environment
resource "aws_route53_record" "api_eb" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_elastic_beanstalk_environment.app_env.cname]

  depends_on = [aws_elastic_beanstalk_environment.app_env]
}

# Optional: Root domain CNAME to EB (if using create_root_record)
# Note: For root domain, you'd typically use Route53 Alias record
resource "aws_route53_record" "root_eb" {
  count   = var.create_root_record ? 1 : 0
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_elastic_beanstalk_environment.app_env.cname
    zone_id                = data.aws_elastic_beanstalk_hosted_zone.current.id
    evaluate_target_health = false
  }
}

# Get the hosted zone ID for the EB region (for alias records)
data "aws_elastic_beanstalk_hosted_zone" "current" {}

# Optional: www subdomain
resource "aws_route53_record" "www_eb" {
  count   = var.create_www_record ? 1 : 0
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_elastic_beanstalk_environment.app_env.cname]
}
