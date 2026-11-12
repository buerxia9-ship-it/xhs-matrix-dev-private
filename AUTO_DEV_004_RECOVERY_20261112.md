# AUTO-DEV-004｜真实交付与离线复核

核验：2026-11-12 14:20:06（香港/北京时间，UTC+8）。项目 XHS_MATRIX_4180。

**当前结论：代码交付阻塞已解除，已有完整远端代码和可应用补丁，进入 GPT 可复核阶段；完整运行验收仍未通过。当前无需 CEO 操作。自动续办不恢复。**

## 恢复证据与并行交付

最初核查 PR #4 为 Draft，head `ea70b5dabd55ef18f6aa6f85ee6355f2d21371b1`，仅说明文件；base main `ab382ba0a4ecb4c8ef0c2cda7360f884d74b25d0`。

当前主机仅在所检查的当前项目、D:/codex 代码位置（排除缓存、依赖、sources 和业务数据）及默认 Codex worktrees 位置找到较早仓库 `D:/codex/Projects/xhs-cloud-foundation-20261109/safe-code`。它是 clean main，HEAD `246d9ce88d7971ac64723e3972179e6fc43a9250`，origin 指向本仓库；不是目标开发 checkout。两个回执所称提交 `42271be5fdcabc689799e1b1bba76c9d7f9d31e1` / `ea31fd22fd98c917081a603393b0f49b210f3154` 及 ea70 基线在该对象库均不存在（cat-file 退出 128）；GitHub 查询两个回执提交均 HTTP 422。worktree list 仅一主树、reflog 仅 246d9ce；fsck 退出 0，7 个 dangling blob、没有 dangling commit。没有 checkout/reset/rebase/修改较早仓库。此结论仅限当前检查位置，不推断其他主机。

本轮先按 Git blob SHA-1 核验还原原 PR 基线 138/138 文件。报告提交前再次核查，发现**并行 GPT GitHub 交付**已把相同开发分支推进到 `3564726c01c2d211b81c4693d81df088dbde21ca`：相对 ea70 为 ahead 6 / behind 0，新增修改限于 P0/P1，没有基线重置。该提交的 implementation-evidence 明确声明它是独立替代实现，**不是恢复的 Codex 旧提交**。本轮没有冒领这些提交，也没有把评论摘要当作源代码。读取实际全部文件并验证 141/141 blob 后进入源代码复核。

## 本轮实际修改与远端证明

活动路由合成测试在 3564726 复现：publishAccountIds 为无效 JSON 时被解析为 [] → standard，导致 workflow 的普通 AI 回退继续执行。测试真实运行现有 workflow 和 composition 包装函数，原来 3/4 通过，缺失预期拒绝的测试失败。

本轮仅修改以下 3 个文件：

- runtime-patches/content-capability.cjs：非法 JSON、非数组发布账号配置和“已配置账号但缺少人设”明确 blocked，避免静默退回普通配图。
- tests/content-route-guards.test.cjs：5 个离线测试，运行现有 workflow/composition 路由保护代码；覆盖换 persona ID、受保护 AI/图库拒绝、1/2/3/4 缺原图阻断、普通账号委派、非法列表与缺人设。
- package.json：把上述回归加入既有 npm test。

没有新增运行时 wrapper 或依赖，没有 schema/lockfile 变动。保留并行实现的账号能力路由、已登记原图 SHA/alpha/像素比较、人工审核取消/发布闸门、1–4 张和 UI 图片错误状态。

通过 GitHub create_tree → create_commit → update_ref 提交到**原有**开发分支，parent=3564726，expected_sha=3564726，force=false；未使用本地 git push。远端 [提交 3c72de9](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/commit/3c72de97cff77c5f439f4ede8fec445a70d455dd) 已回读确认。PR #4 为 Draft / open / 未合并，8 commits / 14 changed files；base main 未改变。

远端 142/142 文件 blob 与已测试候选完全一致。完整 PR diff 已另存；去掉 ea70 已有说明文件的新增 hunk 后得到可应用于 ea70 的**完整 13 文件增量补丁**：
`AUTO-DEV-004-from-ea70b5d.patch`，43,957 bytes，SHA-256 `141f1aac2a35e826634cd6b3818e965c21136dc4708a856e7ba7c96ae21e6def`。在准确 ea70 文件快照上执行 `git apply --check` 退出 **0**。这是实际新远端实现的补丁，不能与旧回执自报的 11 文件补丁混同。

本地全部产物：`D:/codex/Projects/xhs-auto-dev-004-recovery-20261112/output`。GitHub 可直接检查 [PR #4 完整 diff](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/pull/4/files)。

## 实际命令、退出码与限制

当前 Node 24.22.1（退出 0），npm 11.6.2。npm 不在 PATH，实际调用为 `node D:/codex/Tools/node/node_modules/npm/bin/npm-cli.js <参数>`。工作目录为 D 盘隔离快照。完整 argv/stdout/stderr 见 [原始证据](AUTO_DEV_004_DESKTOP_TESTS_20261112.json)。

| 测试/构建命令 | 退出码 | 实际结果 |
| --- | --- | --- |
| node --test tests/foundation.test.cjs（原 ea70） | 0 | 9/9，含 25 条语言政策、离线 Terra、零账号/零供应商 SQLite、网络拒绝和 localhost 正对照 |
| node --test tests/content-pipeline.test.cjs（最终候选） | 0 | 5/5；3 项实际解析器测试，2 项源码字符串检查 |
| node --test tests/content-route-guards.test.cjs（最终候选） | 0 | 5/5；真实现有路由保护函数 + 合成服务替身，无模型/外网/生产数据 |
| npm test（3564726） | 1 | 20/22 |
| npm test（最终候选，与远端 142 blob 一致） | 1 | **25/27**，不能宣布全套通过 |
| node --check（5 个改动相关 runtime cjs） | 0 | 均通过；修复后的解析器另检查退出 0 |
| npm --prefix backend-ts run prisma:generate | 1 | prisma 未安装/无法识别 |
| npm --prefix backend-ts run tsc | 1 | tsc 未安装/无法识别 |
| npm --prefix frontend run build | 1 | vite 未安装/无法识别 |
| git apply --check AUTO-DEV-004-from-ea70b5d.patch | 0 | 13 文件完整增量可应用，无截断 |

最后三个构建命令在 3564726 隔离快照运行；对应 TS/Vue/package-lock/Prisma schema 在最终提交未变化。没有安装、升级依赖或使用另一项目的未锁定依赖。当前缺依赖是**尚需执行锁定安装的工程前置项**，不是已经证明网络无法安装；不能把本轮未安装写成权限永久阻断。

完整套件的 2 个失败均在既有 cloud-setup 测试：Bash 调用不能给出预期拒绝信息（独立 `bash --version` 退出 1，Bash/E_ACCESSDENIED）；创建文件 symlink 报 EPERM。没有开启系统开发者模式、提升系统权限或跳过测试来换取绿灯。Node 版本问题已解除；旧环境 Prisma checksum HTTP 403 **本轮未到下载阶段，既未重现也未证实修复**。

服务替身测试只证明真实路由保护的拒绝/委派行为，**不证明**真实 Sharp 合成、成功生成 1–4 张图片、图片 SHA 不匹配/像素比对、实际 NestJS 编排错误落库/UI 呈现或发布端人工审核不可绕过。上述活动链路仍需锁定依赖后使用离线合成素材验证。无真实包装、原图或付费 API 调用。

## 状态与下一步

- 交付：已解除原“只有摘要”阻塞；原提交未恢复，替代实现和本轮小修复已在同一 PR 可核验。
- GPT：可开始/继续独立代码复核；完整运行验收阻断，acceptance_passed=false。
- 工程待办：隔离环境按现有 lockfile 安装依赖；Prisma generate、后端/前端构建；补足上述实际编排/合成像素/UI/审核回归；解决平台测试运行条件。通过前不进入 P2。
- CEO：目前无需提供补丁或再次授权；本轮不要求用户打开失效任务链接。
- 自动化：本轮仅 view，工具只渲染卡片而未返回可机读 enabled；暂停依据用户本轮指令及报告既有暂停回执，本轮不伪称重新确认 enabled=false。没有任何自动化 mutation，不恢复，也不改其他实验/旧自动化。
- 安全边界：未触碰 main、合并、部署、生产数据/数据库、真实账号、个人凭据、付费业务 API、真实包装或 OS 设置。sources 保持只读。没有新 PR。

本报告更新前另一个执行方已写入 reports/ceo-status；本轮基于其最新报告 head 更新，保留其他历史实验区块，以 expected_sha 防覆盖。
