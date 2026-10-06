terraform {
  required_version = ">= 1.6.0"

  cloud {
    workspaces {
      name = "ovelle-development"
    }
  }

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

provider "cloudflare" {}
