# Elastic Beanstalk outputs
output "eb_application_name" {
  description = "Name of the Elastic Beanstalk application"
  value       = aws_elastic_beanstalk_application.app.name
}

output "eb_environment_name" {
  description = "Name of the Elastic Beanstalk environment"
  value       = aws_elastic_beanstalk_environment.app_env.name
}

output "eb_environment_id" {
  description = "ID of the Elastic Beanstalk environment"
  value       = aws_elastic_beanstalk_environment.app_env.id
}

output "eb_environment_url" {
  description = "URL of the Elastic Beanstalk environment"
  value       = "http://${aws_elastic_beanstalk_environment.app_env.cname}"
}

output "eb_cname" {
  description = "CNAME of the Elastic Beanstalk environment"
  value       = aws_elastic_beanstalk_environment.app_env.cname
}

output "s3_bucket_name" {
  description = "S3 bucket for application versions"
  value       = aws_s3_bucket.app_versions.id
}

output "oidc_role_arn" {
  description = "ARN of the OIDC IAM role for GitHub Actions"
  value       = aws_iam_role.github_actions_role.arn
}

output "api_domain" {
  description = "API domain name"
  value       = "api.${var.domain_name}"
}

output "api_url" {
  description = "Full API URL"
  value       = "https://api.${var.domain_name}"
}

output "route53_zone_id" {
  description = "Route53 hosted zone ID"
  value       = data.aws_route53_zone.main.zone_id
}

output "route53_name_servers" {
  description = "Route53 name servers (update these in your domain registrar)"
  value       = data.aws_route53_zone.main.name_servers
}
