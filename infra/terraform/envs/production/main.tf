module "site" {
  source = "../../modules/cloudflare-site"

  cloudflare_account_id = var.cloudflare_account_id
  d1_database_name      = "ovelle-db-production"
  r2_bucket_name        = "ovelle-storage-production"
  cdn_domain            = "cdn.ovelle.org"
}
