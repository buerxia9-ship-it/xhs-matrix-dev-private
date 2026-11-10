# Existing XHS matrix: code-only cloud baseline

This preserves the Vue frontend, NestJS backend, Prisma schema, dependency locks and local runtime patches of the running workbench. It is not a new workbench and does not include any business database, platform session, real customer data or original images.

Start with AGENTS.md and docs/product/CONTEXT.md.

## Verified locally

- Node 24.22.1, nine offline foundation checks pass.
- The suite invokes the existing 25 language-policy checks and offline Terra parameter compatibility.
- Synthetic SQLite fixture integrity and foreign keys pass; no account or provider is created.
- Backend TypeScript syntax and Vue parsing/template compilation pass.
- These are not fresh Linux dependency installation, full type checking, production equivalence or a completed Codex Cloud run.

## Rebuild after explicit authorization

Use Node 24.22.1, npm, Python 3, and native build tools when needed by SQLite/image packages. In an isolated cloud environment run bash cloud/setup.sh. It uses the existing package-lock files; pnpm locks are retained for provenance. It does not download a browser.

Then set CLOUD_TEST_MODE=1 and run node cloud/start.cjs for a loopback, read-only preview on port 4181. No production credentials are needed or permitted. Review the cloud network policy separately; the application guard is not an OS sandbox.

Original Windows autostart, browser collection, real AI, publishing, product packaging and production-data acceptance remain outside this cloud test scope. The local running workbench is not changed.

Runtime logic includes runtime-patches; a plain upstream rebuild must not be called production-equivalent without checking those patches. Actual account/persona/product knowledge remains authoritative only in the local business database.

The initial review reference is tag cloud-migration-phase1. Resolve its exact commit with git rev-parse cloud-migration-phase1.
