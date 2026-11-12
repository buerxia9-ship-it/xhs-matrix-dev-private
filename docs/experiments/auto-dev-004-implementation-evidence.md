# AUTO-DEV-004 P0/P1 | GPT-mediated recovery implementation

## Delivery and scope
Codex returned local-only commits but no complete patch or remote push. GPT independently implemented a bounded replacement on existing PR #4 from initial head `ea70b5dabd55ef18f6aa6f85ee6355f2d21371b1`. **This is not Codex's unpushed commit.**

The effective runtime chain remains workflow-compat → business-context → acceptance-compat → composition-compat → copywriting-compat. The shared `content-capability.cjs` resolver is imported by existing patches; it does not add a new runtime override layer.

## Configuration and boundaries
A publisher account explicitly opts into the protected content route with its existing `activeWindow` JSON:
```json
{"contentProfile":{"key":"yubao-copy-v1","version":1,"protectedPackaging":true}}
```
Preserve existing scheduling keys in that JSON. This is a **compatibility compromise** using an existing field, not a database migration. No account is auto-enabled. The campaign publishing accounts must match the campaign persona. Mixed protected/ordinary publishers, invalid JSON, missing accounts and mismatched persona fail closed. No fixed persona database ID is used. A future typed field and operator-facing profile control require separate review; do not silently modify production account settings.

The project must explicitly configure `cadence.imageSource` (`ai`, `library` or `mix`) and `imageCount` (1–4). Protected packaging only accepts `mix`, which requires registered original asset SHA and opaque-pixel integrity checks; missing assets block. Image status is logged separately from copywriting, and automated publishing requires `complianceChecked=true` plus images.

## Verification limitations
The shared resolver was exercised in an isolated local Node 22 workspace with 3 passing synthetic tests and no paid API or customer data. This does **not** prove the complete repository suite, NestJS runtime, Prisma generation, Vue build, protected bitmap composition or the new 5-test repository suite. Full integration verification awaits a runnable checkout with pinned Node 24 and Prisma dependencies. Prior Codex reports of 21/22 suite passes, Prisma HTTP 403 and backend TypeScript failures are not reclassified as successes.

No main merge, deployment, publishing, original image or production data access.
