# This file creates the S3 bucket and DynamoDB table for Terraform state
# Run this ONCE with a local backend, then uncomment the backend block in main.tf

# terraform {
#   # Comment out the backend block initially
# }

resource "aws_s3_bucket" "terraform_state" {
  bucket = "eb-express-terraform-state"

  tags = {
    Name        = "Terraform State Bucket"
    Environment = "production"
    ManagedBy   = "Terraform"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DynamoDB table for state locking
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "eb-express-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name        = "Terraform State Lock Table"
    Environment = "production"
    ManagedBy   = "Terraform"
  }

  lifecycle {
    prevent_destroy = true
  }
}
