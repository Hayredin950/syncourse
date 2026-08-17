#!/usr/bin/env bash
# Deploy the Syncourse web app to Cloudflare Pages.
#
# Prereqs:
#   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account-id> ./deploy-pages.sh
#   (or set them in .env.production / your shell)
set -euo pipefail

cd "$(dirname "$0")"

echo "→ Building static export..."
npx next build

echo "→ Setting SPA fallback (serve the app shell for unmatched routes)…"
cp out/index.html out/404.html

echo "→ Deploying to Cloudflare Pages (project: syncourse)…"
npx --yes wrangler@latest pages deploy out --project-name=syncourse --branch=main --commit-dirty=true

echo "✅ Live at https://syncourse.pages.dev"
