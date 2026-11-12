# AUTO-DEV-004 | 最终受控离线验收结论

**结论：PASS（仅 P0/P1 隔离开发分支的离线/合成验收），不等于产品上线验收。**

- 当前验收开发 HEAD：`91299ccfc28ff69fc2460e2f9ae9b6e59791dd78`
- PR [#4](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/pull/4) 仍为 Draft，base=main，未合并。
- [CI #43178252049](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/actions/runs/43178252049) 已结束 `completed/success`，3/3 Jobs 通过，目标 head 匹配。
- `npm test` 离线基础测试 **27/27**；编译后 NestJS 服务 + 真 Sharp 合成/审核保护专项 **6/6**；真实构建的 Vue 页面通过 Chrome + 本地假 API 的 UI 冒烟测试 **1/1**。
- 保护范围：1/2/3/4 张透明合成 PNG、登记原图 SHA / 不透明像素一致性、丢失/篡改/非透明素材前置阻断、动态 account/persona 权限、配图失败与文案成功分别记录、未审核或缺图草稿不能发布、`markPublished` 必须审核通过且存在同账号 `awaiting_manual` 作业、UI 上未审核/无待确认记录不能直接点击标记发布。
- 修复记录：`44a12b67f43cd9cd8e88bfd9e59429e3f257b07c`（服务与前端的人工审核补丁）；`91299ccfc28ff69fc2460e2f9ae9b6e59791dd78`（独立 Chrome UI 冒烟回归），测试均运行在受控 GitHub Actions。
- 所有图片、账号、数据库记录、发布器、HTTP API 输入均为合成，**没有**调用真实小红书、付费模型、客户信息、真实包装文件、部署或发布。
- 未验收：真实账号浏览器流程、生产数据迁移、真实包装授权样品下的创意质量、跨设备 Windows 操作体验、运营转化表现。这些是后续上线/用户人工验收，不得外推到 P0/P1 离线验证。
- 静态设计待偿还：`activeWindow` JSON 临时复用为账号内容能力配置；未来可转 typed config（需产品评审）。本轮未写真实账号能力数据。
- 进一步开发 P2 必须使用另一个独立 stacked Draft PR（base 此 PR 的开发分支），不能把 P0/P1 当成已合并 main。禁止自动合并、部署或扩大业务权限。

---

# AUTO-DEV-004 | Independent review checkpoint

**Review date:** 2026-11-12 UTC  
**Repository:** `buerxia9-ship-it/xhs-matrix-dev-private`  
**PR:** [#4](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/pull/4) (Draft, **not merged**)  
**Base:** `main` @ `ab382ba0a4ecb4c8ef0c2cda7360f884d74b25d0`  
**Verified remote head:** `3564726c01c2d211b81c4693d81df088dbde21ca`  
**PR:** 13 changed files, 7 commits, base unchanged.

## What actually happened
1. Codex's first two replies reported local-only commits, with no remote push and no complete patch body. Neither commit is present in GitHub. Those results were **not** treated as delivered source.
2. The owner already authorized independent branch code changes. GPT reimplemented the bounded P0/P1 fixes directly against the actual remote baseline using GitHub Git objects and file updates. These are **GPT-mediated commits**, not Codex's local commit.
3. GitHub PR #4 now has real reviewable business-code changes, not only a scope marker. The **delivery blockage is resolved**.

## Source-level review findings
- Account capability resolver in `runtime-patches/content-capability.cjs`: account + campaign persona binding, malformed/mixed account fail-closed; removes fixed Yubao persona database ID from the effective workflow/business-context/copywriting/composition patches.
- Protected `mix` route preserves registered asset SHA and opaque-pixel verification; missing or changed assets still block. Non-protected accounts use ordinary routing, without inheriting the protected business knowledge.
- Autopilot logs `image` success/error separately from text generation; no default fallback from missing `imageSource` to `ai`. UI shows image step and 1–4 image settings.
- Core `GenerateService` no longer calls AI prompt generation or image generation when source is `library`, and refuses partial image sets. Image updates invalidate previous human approval.
- Auto-publish only considers `ready` drafts with `complianceChecked === true` and at least one image.

**Independent remote source audit:** 20/20 targeted static invariants checked against actual GitHub files. This is a code inspection, **not a runtime test**.

## Tests actually executed
- Isolated local Node.js 22.16.0 synthetic test for account capability resolver: `node --test /mnt/data/auto-dev-004-local/tests/content-capability.test.cjs`, exit **0**, **3/3** passed.
- Isolated syntax check: `node --check /mnt/data/auto-dev-004-local/runtime-patches/content-capability.cjs`, exit **0**.
- The repository's newly added `tests/content-pipeline.test.cjs` is present on GitHub, but its full 5-test suite **was not executed from a runnable checkout**.

## Still unverified / acceptance blocked
- Full `npm test` under pinned Node 24.22.1.
- `npm --prefix frontend run build`.
- Prisma client generation, backend TypeScript compile, NestJS runtime with effective patches.
- Real operator UI, protected composition bitmap integrity with authorized assets, end-to-end 1/2/3/4 image runs, and manual approval path.
- The `Account.activeWindow` JSON field is being reused as a compatibility store for `contentProfile`. This avoids a migration but weakens type safety and has no approved operator-facing account opt-in UI yet. No production account was configured. A typed capability field is a future design improvement, not silently implemented here.
- The image count is presently configured per project, not dynamically inferred per individual content brief. No production generation claims.

**Verdict:** P0/P1 source delivery achieved and source audit preliminarily passed. **Not end-to-end accepted.** Keep Draft PR; do not merge, deploy, publish, touch production data, or begin P2 as if P0/P1 were validated. Next technical step is a runnable isolated Node24/Prisma environment and true synthetic integration tests. No CEO decision is needed to inspect code; a specific request will be raised only if technical access to a runnable environment cannot be resolved.
