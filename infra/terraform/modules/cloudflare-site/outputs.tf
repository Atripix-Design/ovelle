output "d1_database_id" {
  value = cloudflare_d1_database.app.id
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.storage.name
}
