variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "eu-west-2"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "eb-express"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "ssh_public_key" {
  description = "SSH public key for EC2 access"
  type        = string
  sensitive   = true
}

variable "github_org" {
  description = "GitHub organization or username"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "eb-express"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "brigid-personal-assistant.com"
}

variable "create_root_record" {
  description = "Create A record for root domain"
  type        = bool
  default     = false
}

variable "create_www_record" {
  description = "Create A record for www subdomain"
  type        = bool
  default     = false
}
