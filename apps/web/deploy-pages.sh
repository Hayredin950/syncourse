#!/usr/bin/env bash
# Deploy the Syncourse web app to Cloudflare Pages.
#
# Prereqs:
#   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account-id> ./deploy-pages.sh
#   (or set them in .env.production / your shell)
set -euo pipefail

cd "$(dirname "$0")"

echo "→ Building static export (clean — env vars like NEXT_PUBLIC_* are inlined at build time)..."
rm -rf .next out
npx next build

# The static export already generates out/404.html from app/not-found.tsx —
# a "smart 404" that renders course pages for /courses/<slug> URLs created
# after the last build (e.g. via the Telegram bot). Do NOT overwrite it with
# the app shell, or every new course 404s until the next deploy.
echo "→ Keeping smart 404 (out/404.html from app/not-found.tsx)…"

echo "→ Deploying to Cloudflare Pages (project: syncourse)…"
npx --yes wrangler@latest pages deploy out --project-name=syncourse --branch=main --commit-dirty=true

echo "✅ Live at https://syncourse.pages.dev"
