# AUTO-DEV-004 | Controlled code modification and independent acceptance

Status: authorized kickoff only; implementation and tests pending.

## Why this branch exists
The owner authorized a limited GPT Product Owner x Codex Developer implementation, synthetic testing, independent verification, and one bounded repair cycle. This is a dedicated development branch, not the existing documentation-trigger experiment PR #2.

## Product goal
Repair the operational content-production pipeline without building another stack of runtime monkey patches. Focus on the existing P0 (automatic image generation can fail silently and incorrectly report success) and P1 (account-specific copy checks depend on a hard-coded database record ID). P2 (generic topic template) remains a separate subsequent scope.

## Implementation constraints
- Start from main commit `ab382ba0a4ecb4c8ef0c2cda7360f884d74b25d0`. Stop on unexpected baseline drift; do not silently rebase.
- Read root `AGENTS.md`, `docs/product/CONTEXT.md`, `docs/product/CURRENT_STATE.md`, and the effective `runtime-patches` load chain.
- Target the smallest maintainable change at the authoritative implementation point. Prefer refactoring an existing implementation to adding wrappers, implicit overrides, duplicate branches, new dependencies, or schema migrations.
- Preserve Vue/NestJS/Prisma, existing account/knowledge/history isolation, product packaging SHA and pixel protections, manual approval gates, and planner-selected image counts 1-4. Never fabricate product packaging or business facts.
- Only synthetic fixtures. No production database, accounts, original packaging, credentials, browser profiles, customer data, external business/model APIs, XHS publishing, merge, or deployment.
- Tests: offline, deterministic, with the exact installed/locked dependencies. If installation is required, restrict it to an isolated build environment and existing lockfiles. Report actual commands, exits, and any setup limitation.
- A successful copy draft must never be described as an image success if image generation failed. Expose actionable diagnostic state; do not swallow errors silently.
- Never auto-merge to main. Reviewer must independently inspect actual diff/source/test evidence.
- The Codex handoff may use this PR's existing head branch if official push works; if not, it must return an exact complete patch for GPT-mediated, separately verified delivery. Do not invent a remote push or claim test success without output.

This is a scope and evidence marker only; it is not a completed implementation, a successful test, or a new authorization source.
