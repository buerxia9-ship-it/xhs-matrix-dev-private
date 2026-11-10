#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CLOUD_TEST_MODE=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export PATCHRIGHT_SKIP_BROWSER_DOWNLOAD=1
export npm_config_audit=false
export npm_config_fund=false
node -e "if(process.versions.node!=='24.22.1')throw new Error('Select Node 24.22.1 in the cloud environment first')"
mkdir -p .cloud-data
export DATABASE_URL="file:$PWD/.cloud-data/fixture.db"
export PRISMA_SKIP_POSTINSTALL_GENERATE=1
npm ci --prefix backend-ts
npm ci --prefix frontend
mkdir -p .cloud-data
export DATABASE_URL="file:$PWD/.cloud-data/fixture.db"
(cd backend-ts && ./node_modules/.bin/prisma generate && npm run build)
(cd frontend && npm run build)
python3 cloud/create-fixture.py
npm test
