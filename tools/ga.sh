#!/usr/bin/env bash
# Runs GA tools with a short-lived token of the ga-admin service account (gcloud impersonation).
#   tools/ga.sh setup [--dry-run]
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.ga ] && source .env.ga
: "${GA_PROPERTY:?set GA_PROPERTY in .env.ga}"
: "${GA_SA:?set GA_SA in .env.ga}"
unset GA_QUOTA_PROJECT   # not needed (and may 403) with a service account token
cmd="${1:-}"; shift || true
case "$cmd" in
  setup) scope=https://www.googleapis.com/auth/analytics.edit; script=tools/ga-setup.mjs ;;
  *) echo "Usage: tools/ga.sh setup [--dry-run]"; exit 1 ;;
esac
token=$(gcloud auth print-access-token --impersonate-service-account="$GA_SA" --scopes="$scope")
GA_TOKEN="$token" GA_PROPERTY="$GA_PROPERTY" node "$script" "$@"
