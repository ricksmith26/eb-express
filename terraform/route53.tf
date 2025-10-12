# Route53 DNS configuration for custom domain

# Data source to get existing hosted zone (if it exists)
# Comment this out if the zone doesn't exist yet
data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

# Uncomment this block if you need to CREATE the hosted zone
# (Comment it out after first apply if zone already exists)
# resource "aws_route53_zone" "main" {
#   name = var.domain_name
#
#   tags = {
#     Name        = var.domain_name
#     Environment = var.environment
#     ManagedBy   = "Terraform"
#   }
# }

# A record for API subdomain pointing to EC2 Elastic IP
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.app_eip.public_ip]
}

# Optional: Root domain A record (if you want to point root to the same server)
resource "aws_route53_record" "root" {
  count   = var.create_root_record ? 1 : 0
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = [aws_eip.app_eip.public_ip]
}

# Optional: www subdomain
resource "aws_route53_record" "www" {
  count   = var.create_www_record ? 1 : 0
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.app_eip.public_ip]
}
