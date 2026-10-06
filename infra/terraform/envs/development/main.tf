module "site" {
  source = "../../modules/cloudflare-site"

  cloudflare_account_id = "47b7e4cbf6e4918eecb9241815337c9e"
  d1_database_name      = "ovelle-db-development"
  r2_bucket_name        = "ovelle-storage-development"
}
