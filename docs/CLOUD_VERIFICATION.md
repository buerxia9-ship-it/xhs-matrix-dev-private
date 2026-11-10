# Cloud verification gate

1. User/PO approve the exact reviewed commit and upload scope. Only then create a private repository and grant Codex access to that repository.
2. Use the current Codex Cloud environment setup flow. Select Node 24.22.1 and the necessary public package/binary download domains only. Configure no business API credentials.
3. Run cloud/setup.sh and save actual dependency install, Prisma generation, backend/frontend builds and tests. Native SQLite/sharp and Prisma engine compatibility must be proven on Linux.
4. Preview only the synthetic database on 127.0.0.1:4181. Check zero real accounts/providers, empty signatures, binding consistency and disabled account/publishing/paid AI routes.
5. First scoped development task: add a regression for confirmed versus unconfirmed editorial feedback in synthetic copy context. Present before/after failures, diff, passed tests and unresolved gaps. Do not introduce a real model or product dataset.
6. PO judges the actual result. A successfully published environment or a stored repository does not prove that this development task executed.

No GitHub Actions workflow is enabled in this baseline. No automatic cloud publishing, remote deployment or second Agent executor is created.
If the UI presents a legacy environment workflow, follow the corresponding current official guide rather than assuming it matches the new reusable environment flow.
