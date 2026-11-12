# AUTO-DEV-005 P2 | Evidence-linked topic candidates

**Status: scoped / ready for development, no P2 implementation yet.**

**Dependency:** This independent branch begins at P0/P1 offline-accepted head `91299ccfc28ff69fc2460e2f9ae9b6e59791dd78` ([PR #4](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/pull/4), still Draft). Its stacked PR must target `dev/auto-dev-004-content-pipeline`, **never main**; it cannot be independently merged while P0/P1 is pending.

## Focus
- Derive concrete topic candidates from already existing, campaign-bound note titles and only verified linked comment records; distinguish "collected search note title" from a real comment, testimonial or customer experience.
- Preserve actual evidence type, note/comment IDs, campaign boundaries and clear confidence labels in existing Topic.angle and Topic.rationale. No source, no invented users/quotes/experiments/candidates.
- Replace the generic six fixed template categories with specific, reproducible, restrained angles; no hard-coded Yubao persona database ID or other account name; respect dynamic multi-account and multi-category settings.
- Never delete adopted/discarded items, keep all candidates editable and avoid duplicates on reruns.
- Prefer changes in core `AnalysisService` and reduce the existing `acceptance-compat.cjs` override, rather than stacking another runtime monkey patch. No schema migrations or new dependencies.
- Synthetic offline fixtures only. No real collection, customers, XHS publishing, replies, paid model/image APIs, secrets, packaging, or deployment.

## Evidence-based acceptance
1. Empty evidence produces zero topics, with an accurate "no source" explanation.
2. Title-only notes produce source-linked title clues, never claims of customer feedback or comment frequency.
3. Actual linked comments, if used, preserve note/comment IDs and distinguish source type.
4. Same campaign rerun has no duplicates or status reset; adopted/discarded survive.
5. Dynamic campaigns with distinct products remain isolated; no forced "迪拜猫砂" for unrelated categories.
6. Titles reflect the specific traceable concern instead of category boilerplate, without fabricating first-person use or customer quotes.
7. Run full Node 24 offline suites, backend build, and P0/P1 image/publish protections; real command/exit/log evidence.

## Bounded workflow
Codex receives at most one P2 implementation request under the remaining dispatch allowance. Actual remote code or a complete exact patch is required; a local commit or text-only summary is not delivery. GPT independently reviews code/tests, with bounded fallback on this new branch only. Report active/idle/blocked honestly to the CEO. No merge, deployment or extra PR expansion.
