module "site" {
  source = "../../modules/cloudflare-site"

  cloudflare_account_id = "83952a1be987e4a12647732861a60925"
  d1_database_name      = "ovelle-db-production"
  r2_bucket_name        = "ovelle-storage-production"
  cdn_domain            = "cdn.ovelle.org"
}
