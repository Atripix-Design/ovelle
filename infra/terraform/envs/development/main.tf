module "site" {
  source = "../../modules/cloudflare-site"

  cloudflare_account_id = "83952a1be987e4a12647732861a60925"
  d1_database_name      = "ovelle-db-development"
  r2_bucket_name        = "ovelle-storage-development"
}
