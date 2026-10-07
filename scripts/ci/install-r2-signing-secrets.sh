#!/usr/bin/env bash
set -euo pipefail

if [[ ! -t 0 ]]; then
  echo 'Run this script in an interactive terminal so the R2 secret stays out of command history.' >&2
  exit 1
fi

task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$task_root"
export XDG_CONFIG_HOME="$HOME/.config/ovelle-auth-flow"
export CLOUDFLARE_ACCOUNT_ID=83952a1be987e4a12647732861a60925
read -r -p 'R2 Access Key ID: ' r2_access_key_id
read -r -s -p 'R2 Secret Access Key: ' r2_secret_access_key
echo
trap 'unset r2_access_key_id r2_secret_access_key' EXIT

R2_ACCESS_KEY_ID="$r2_access_key_id" R2_SECRET_ACCESS_KEY="$r2_secret_access_key" \
  node scripts/verify-r2-key.mjs

for environment in development production; do
  printf '%s' "$r2_access_key_id" | ./node_modules/.bin/wrangler secret put R2_ACCESS_KEY_ID --env "$environment"
  printf '%s' "$r2_secret_access_key" | ./node_modules/.bin/wrangler secret put R2_SECRET_ACCESS_KEY --env "$environment"
done

echo 'Ovelle R2 signing secrets installed in both Workers.'
