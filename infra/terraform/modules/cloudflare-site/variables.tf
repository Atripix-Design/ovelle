variable "cloudflare_account_id" {
  description = "Personal Cloudflare account that owns Ovelle resources."
  type        = string
}

variable "d1_database_name" {
  description = "Existing environment-specific D1 database name."
  type        = string
}

variable "r2_bucket_name" {
  description = "Existing environment-specific R2 bucket name."
  type        = string
}
