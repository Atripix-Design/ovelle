variable "cloudflare_account_id" {
  description = "Cloudflare account containing the application resources; configure outside Git."
  type        = string
  sensitive   = true
}
