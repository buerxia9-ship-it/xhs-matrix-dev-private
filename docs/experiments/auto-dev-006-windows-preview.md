# Independent Windows preview and offline synthetic review sandbox

Base: PR #6 `dev/auto-dev-006-topic-quality-demo`, exact commit `19754dc48dfaa7021e0c8249428835424d209bde`. This narrow preview branch does not replace the existing local workbench or merge upstream PRs.

## Two separate processes and databases

- `http://127.0.0.1:4181`: unchanged `cloud/start.cjs`, compiled Vue/NestJS read-only preview. `.cloud-data/fixture.db`, zero accounts/providers. POST/PUT/PATCH/DELETE and publishing/collection/account routes remain denied.
- `http://127.0.0.1:4182`: `cloud/sandbox/server.cjs`, a dedicated synthetic acceptance panel using actual compiled AnalysisService/GenerateService with an explicit deterministic offline mock provider. `.cloud-data/sandbox/fixture.db`, three synthetic account/persona/product-knowledge scopes; no cookies, providers or real media.
- Each process binds loopback only. Neither exposes production settings or a proxy route. Existing workbench ports/data are never an argument to these launchers.

The sandbox is a test adapter, not a replacement workbench or a production-equivalence assertion. It has no external model client, social login, collection, scheduling, OS startup, publishing or mark-published endpoints. It denies outbound sockets, fetch/http/https and child processes. This is an application boundary, not an OS sandbox for arbitrary agent code.

## Native Windows build

Use Node 24.22.1, Python 3, and an existing npm CLI. Keep all current locks. Run in this independent checkout only:

```powershell
$env:XHS_NPM_CLI = '<existing npm-cli.js path>'
$env:PYTHON_BIN = '<existing Python executable>'
node cloud/setup-windows.cjs
python cloud/preview-windows.py start both
```

`setup-windows.cjs` refuses unknown existing fixture data before cache creation or installation. Windows SQLite 11.10 nested in Prisma has no Node-24/ABI-137 Windows prebuild. Default npm ci can fail after a network reset and then require Visual Studio. The Windows wrapper does not install system tools or alter locks: it installs backend dependencies with `--ignore-scripts`, installs frontend normally, verifies the official SQLite 12.10.0 prebuilt archive and binary hashes, generates Prisma, builds both sides and runs the foundation suite. Both preview launchers explicitly map SQLite imports to this locked top-level dependency. The unused nested 11.10 native package remains unbuilt; do not start an unrestricted alternate backend entrypoint with this installation.

Official native archive: https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.10.0
Archive SHA256: `0f6d948e6438f64c983d08a2048ef10d6f467f36a8c08f20d31f585c019eb83c`.
The complete one-command Windows installer has not been rerun over active DLLs; the same individual install/generate/build steps and preflight refusal tests were actually executed. Stop only these previews before reinstalling dependencies.

The launcher creates hidden processes with an allowlisted environment, records PID/creation time/entrypoint, verifies health, and reuses an already-running matching process. Stop:

```powershell
python cloud/preview-windows.py stop both
```

It refuses a reused/unrelated PID and never searches for arbitrary node.exe processes to kill. It creates no autorun, firewall or OS policy change.

## Scope and evidence

B01 begins with a question about visible white granules, without assuming cassava. D01 addresses channel paperwork; O01 distinguishes low dust from zero dust. Every input, product fact and mock output is synthetic and marked as such.

The review panel supports source inspection, reasoned topic adoption/revision/discard, explicit mock/no-provider choices, copy failure, draft editing, 1–4 synthetic images, image/missing-material failures, rule-check submission and human approval/revision/discard. Editing copy or images resets approval. Three knowledge/material/history/review-memory scopes are distinct. Reading mock-context history/feedback does not demonstrate a real model learning from it.

Packaging is a newly created DEMO image, not a real brand asset. The adapter verifies the reference SHA and exact opaque pixels after composition. This does not pass real packaging, visual quality or editorial acceptance. All real publishing remains impossible. Existing compiled-service tests separately exercise the original protected-composition patch.

## Actual Windows validation

Node 24.22.1, npm 11.6.2. Prisma generation, Nest build and Vue build exited 0. Latest results:

| Command | Result |
|---|---|
| npm test | 27/27, exit 0 |
| npm run test:p2 | 7/7, exit 0 |
| node --test tests/content-image-integration.test.cjs tests/content-ui-smoke.test.cjs tests/p3-topic-quality-demo.test.cjs | 11/11, exit 0 |
| node --test tests/windows-sandbox.test.cjs | 12/12, exit 0 |
| node --test tests/local-preview-ui.test.cjs | 1 browser journey, three accounts, exit 0 |

Browser tests require `PREVIEW_CHROME_PATH` pointing to an existing isolated browser executable. They create temporary profiles, allow only local preview requests, and save screenshots in `.cloud-data/ui-evidence` or `PREVIEW_ARTIFACT_DIR`. The explicit local UI test requires both preview servers running; it is not silently skipped in CI.

Windows test portability fixes preserve Linux behavior: native setup refusal instead of a missing bash entry, a real junction refusal instead of enabling file-symlink privileges, path normalization for the protected-composition module stub, and a configurable Chrome path without disabling the Windows browser sandbox.

Earlier failures, each fix and final local logs/screenshots are retained outside tracked code. One initial foundation stdout was overwritten before log versioning was added; its captured failure observation is retained and labeled, not represented as the original raw stream.

Production preservation was verified locally: same existing service PID, unchanged database bytes and all 20 table fingerprints, unchanged 462 protected code/config/media file hashes, provider/account settings unchanged and health HTTP 200. Private fingerprints, databases, screenshots, cookies, credentials and local paths are not included in this PR.

## Acceptance remains separate

Local technical preview is running. CEO editorial/visual acceptance remains pending; automated clicks are not user approval. No real account, API model, packaging quality, deployment, production write or main merge was tested or authorized by this preview.
