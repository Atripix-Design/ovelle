output "d1_database_id" {
  value = cloudflare_d1_database.app.id
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.storage.name
}

output "cdn_domain" {
  value = data.cloudflare_r2_custom_domain.downloads.domain
}
