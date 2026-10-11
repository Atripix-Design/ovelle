variable "cloudflare_account_id" {
  description = "Cloudflare account that owns the application resources."
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

variable "cdn_domain" {
  description = "Public download domain for this environment's R2 bucket."
  type        = string
}
