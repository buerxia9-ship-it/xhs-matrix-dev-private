#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CLOUD_TEST_MODE=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export PATCHRIGHT_SKIP_BROWSER_DOWNLOAD=1
export npm_config_audit=false
export npm_config_fund=false
node -e "if(process.versions.node!=='24.22.1')throw new Error('Select Node 24.22.1 in the cloud environment first')"
cloud_data_dir="$(node -p "require('./cloud/preflight.cjs').dataPath()")"
export XDG_CACHE_HOME="$cloud_data_dir/cache"
export npm_config_cache="$XDG_CACHE_HOME/npm"
export npm_config_registry=https://registry.npmjs.org
export npm_config_replace_registry_host=always
export DATABASE_URL="file:$cloud_data_dir/fixture.db"
# Refuse an unrecognized existing database before installing or building anything.
python3 cloud/ensure-fixture.py
mkdir -p "$npm_config_cache"
export PRISMA_SKIP_POSTINSTALL_GENERATE=1
npm ci --prefix backend-ts
npm ci --prefix frontend
(cd backend-ts && ./node_modules/.bin/prisma generate && npm run build)
(cd frontend && npm run build)
npm test
