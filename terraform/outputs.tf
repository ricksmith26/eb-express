output "instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.app.id
}

output "instance_public_ip" {
  description = "Public IP address of the EC2 instance"
  value       = aws_eip.app_eip.public_ip
}

output "instance_public_dns" {
  description = "Public DNS name of the EC2 instance"
  value       = aws_instance.app.public_dns
}

output "security_group_id" {
  description = "ID of the security group"
  value       = aws_security_group.app_sg.id
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "ssh -i ~/.ssh/${var.app_name}-key.pem ec2-user@${aws_eip.app_eip.public_ip}"
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
