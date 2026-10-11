module "site" {
  source = "../../modules/cloudflare-site"

  cloudflare_account_id = var.cloudflare_account_id
  d1_database_name      = "ovelle-db-development"
  r2_bucket_name        = "ovelle-storage-development"
  cdn_domain            = "cdn.dev.ovelle.org"
}
