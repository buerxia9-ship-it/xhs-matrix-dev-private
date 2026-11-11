# OPS-CONTEXT-AUDIT-003｜小红书矩阵内容生产链路只读审计

- 本轮核验：2026-11-12 01:20（Asia/Tokyo，核验启动时间）
- 范围：仓库 `buerxia9-ship-it/xhs-matrix-dev-private`，PR #2，固定源码版本 `df84de4ba4fb1ca6d744b786eaf8510e6e021e06`。
- Codex 原始回执：[GitHub 评论 6799971916](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/pull/2#issuecomment-6799971916)；GPT 已重新读取与核对下列实际源码片段，不以机器人结论代替核验。
- PR #2 在核验时仍 open、未合并，head 未变；main 为 `ab382ba0a4ecb4c8ef0c2cda7360f884d74b25d0`。本轮没有改动 PR 分支或业务代码。
- **结论：只读代码诊断通过证据复核，但业务修复、真实运行及无人值守开发闭环均尚未完成。** Codex 自报工作区前后 clean，仅能确认其回执与远端无新提交，无法独立证明其本地所有操作。

## 有效调用链与证据边界

`cloud/start.cjs` 的补丁加载顺序包括 `workflow-compat → business-context → acceptance-compat → composition-compat → copywriting-compat`，因此不能只审查 NestJS 源文件而忽略最终覆写。参见 [启动器 L36–40](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/cloud/start.cjs#L36-L40)。

搜索笔记（campaign 关联）→ [AnalysisService.runForCampaign](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/acceptance-compat.cjs#L4-L13) 生成 candidate topic → 采纳 → [GenerateService.generateFromTopic](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/copywriting-compat.cjs#L50-L60) 选择人设专用或回退路径 → [context.build](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/copywriting/context.cjs#L3-L14) 限定知识与历史 → 保存草稿 → [orchestrator](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/backend-ts/src/modules/autopilot/orchestrator.service.ts#L129-L146) 触发配图 → [composition](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/composition-compat.cjs#L9-L28) 原包装合成或 [workflow guard](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/workflow-compat.cjs#L27-L40) 拒绝纯 AI 包装。

注意：这是**已装载的代码路径**，不是「生产已发生」的证明。这个云端预览的 HTTP 变更与 AI 路径受额外拦截；正式 Windows 业务数据库、运营素材及产出不可据此推断（参见 [AGENTS.md](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/AGENTS.md)、[CURRENT_STATE.md](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/docs/product/CURRENT_STATE.md)）。

## 三项经源代码证实的重点问题

### P0｜自动配图默认值与原包装保护闸门冲突，错误被静默吞掉

- 依据：[orchestrator.service.ts L129–146](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/backend-ts/src/modules/autopilot/orchestrator.service.ts#L129-L146) 将 `cad.imageSource || "ai"` 传入；内部 `catch {}` 不记录配图失败且 `genCount++` 已执行。[workflow-compat.cjs L27–40](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/workflow-compat.cjs#L27-L40) 对硬编码渝宝 ID 与 `source="ai"` 直接抛错；[composition-compat.cjs L9–18](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/composition-compat.cjs#L9-L18) 仅 `mix` 走原包装路径。
- 触发前提：该人设确为代码匹配 ID，且运行自动/半自动生成而 `cadence.imageSource` 缺失或选择 `ai`。
- 后果：草稿已生成却可能没有图、没有明显错误原因；但包装保护本身是正确的，**不能改成用 AI 重绘包装**。
- 判断：代码条件逻辑确认（高）；实际 Windows 业务配置和发生频率未知。

### P1｜文案专用能力由数据库记录 ID 硬编码选择

- 依据：[copywriting-compat.cjs L50–59](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/copywriting-compat.cjs#L50-L59)，不匹配 `cmw1s72vh000yqcncwkg0hgx1` 即调用先前版本，跳过这一层特定的结构化事实核查和文风复核。先前版本仍存在知识约束，故不能断言其完全失控。[context.cjs L3–14、L25–33](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/copywriting/context.cjs#L3-L33) 已有可重用的知识空间、历史和已确认风格构件。
- 触发前提：账号迁移、重绑定或克隆导致 persona ID 改变。
- 后果：无法保证渝宝的特定事实闸门与风格检查持续生效。
- 判断：硬编码风险确认（高）；是否实际命中未知，不将其称为现网故障。

### P2｜选题采集压缩成六类通用标题模板，丢失细分需求

- 依据：[acceptance-compat.cjs L4–13](https://github.com/buerxia9-ship-it/xhs-matrix-dev-private/blob/df84de4ba4fb1ca6d744b786eaf8510e6e021e06/runtime-patches/acceptance-compat.cjs#L4-L13)。只用 note.title 关键词命中六组；生成通用 `迪拜猫砂，〈类目〉怎么选？`，角度是 `搜索标题线索：〈类目〉`，没有依据 note 正文、客户评论和账号长期档案形成具体洞察。它确实保留 campaignId 隔离且明确说明不等于评论证据，这些合理控制需保留。
- 触发前提：调用这条采集生成路径且输入的标题匹配上述关键词。
- 后果：多种真实用户需求被压成同一种宽泛题目；下游文案能补充人设，但难以重新找回选题阶段遗漏的需求差异。
- 判断：该 patched 方法的行为确认（高）；实际生产如何采纳选题和真实数据质量未知。

## 下一项最小实现建议（仅方案，未授权写入业务代码）

建议先做一张受控的「内容链路路由与错误透明化」开发任务卡，优先解决 P0/P1，再排 P2 为下一张独立小任务，避免把选题、编辑器、模型/图片设计同时大改：

1. 用**账号维度的明确 capability/profile 配置**替代渝宝 persona 行 ID 硬编码；不扩散到其他账号，保留各账号绑定知识和已确认反馈的隔离。
2. 配图选择与该 profile 一致：渝宝具备已授权原包装时走 `mix`；无包装图、SHA 不符或模型失败时阻断并显示可定位原因，绝不合成假包装。图片数量由策划指定 1–4，未配置可默认 1，不强制 3。
3. 清除自动链路的空 `catch {}`；为每篇草稿保留图像步骤的 success / blocked / error 状态、原因和重试入口，不能把「生成文案成功」等同于「整篇图文已完成」。
4. 离线合成回归测试覆盖：渝宝账号 ID 重绑定；普通账号不读取渝宝专用知识/反馈；缺原包装与 hash 不匹配时可解释地阻断；1/2/3/4 图配置；草稿–campaign–persona 关联；错误对操作界面可见。
5. P2 另行规划：以真实采集片段作为候选证据，保留具体客户疑问与来源；不能把搜索标题推断冒充用户评论、客户体验、实测或实时库存。

**验收标准**：必须展示真实 diff、固定基线、最小变更文件清单、离线测试结果以及失败分支的 UI/日志证据；在没有正式业务授权素材时不得宣称图片观感改善或真实运营转化提升。保留 Vue/NestJS/Prisma 四菜单与多账号动态配置、人工审核、原包装保护、无需改正式数据库。发生基线变化即停止并请求重新核验。

## 权限、风险与停止门槛

- 本轮未运行构建、安装、CI、模型或业务系统；只读远端源代码。回执显示 Codex 自报初末工作区 clean，未提供可独立验证的本地执行轨迹；PR head 与 main 未变。
- 历史 HANDOFF-PATCH-002 自报过未授权的本地 commit 与 `make_pr`，**指令权限服从性未通过**；Codex 原生 GitHub push 也未修复。因此任何真正业务代码的自动写入仍需独立边界和明确授权。
- 当前有限续办到此完成：「接回 Codex 审计 → GPT 独立验证 → 留下可实施任务范围」。**状态：待产品方案与写入边界确认（awaiting_owner）**；停止继续派单和一切业务代码更改。该停止门槛不是最终产品项目完成。

[CEO 看板](CEO_STATUS.md) · [交付复核](AUTO_HANDOFF_REVIEW.md) · [运行状态](AUTO_HANDOFF_STATE.json)
