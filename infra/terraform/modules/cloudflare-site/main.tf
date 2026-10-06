resource "cloudflare_d1_database" "app" {
  account_id = var.cloudflare_account_id
  name       = var.d1_database_name

  read_replication = {
    mode = "disabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_bucket" "storage" {
  account_id = var.cloudflare_account_id
  name       = var.r2_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}
