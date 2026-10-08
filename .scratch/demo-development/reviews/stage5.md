# 阶段 5：整分支独立双轴审查

固定基线：`8cce9f0df15021ff30d4b45b11ed9d3a68362405`。审查提交：`b393ea5a7d0570f82d42a9fa239cd1b32ec48ac8`，已包含工单 01–07 的工程实现、正式发布及回滚证据。两个审查代理独立执行，未读取彼此的结论。

## Standards

审查 HEAD：`b393ea5a7d0570f82d42a9fa239cd1b32ec48ac8`；范围：`git diff 8cce9f0...b393ea5a7d0570f82d42a9fa239cd1b32ec48ac8`。

未发现可证实的硬性仓库规范违反。

- **[P3] 判断项：possible Duplicated Code——统一分页结果合并。** [NearbyPage.tsx:63](/Users/bytedance/Desktop/ReadytoGo/src/client/NearbyPage.tsx:63) 的 `mergePages` 与 [usePlanResults.ts:28](/Users/bytedance/Desktop/ReadytoGo/src/client/usePlanResults.ts:28) 的 `combine` 重复维护分组收集、排序和聚合状态。附近页使用 `entries.set(candidate.toiletId, { group, candidate })`；规划页另有 `sameToilet(candidate, id) || sameToilet(value.candidate, candidate.toiletId)` 后删除旧项，身份处理已经分叉。之后修正同一分页排序或候选身份规则需要修改两处，容易遗漏其中一个入口。建议提取供两处复用的纯合并函数，并保留别名去重。依据：[code-review/SKILL.md:46](/Users/bytedance/Desktop/ReadytoGo/.agents/skills/code-review/SKILL.md:46) 的 Duplicated Code 基线；按该文件第 41 行，这只是维护性判断，不是硬性违规。未据此宣称已复现真实接口产生重复卡片。

本轮仅做只读源代码审查，未重新调用真实模型/地图，也未访问实际应用浏览器。真实手机验收尚未执行，是已知验收缺口，不计作本次工程发现。

## Spec

审查 HEAD：`b393ea5a7d0570f82d42a9fa239cd1b32ec48ac8`；基线：`8cce9f0`。规格简称 `spec.md` 指 `.scratch/demo-development/spec.md`。核对61条故事、01–07工单及五份PRD细则；以下4项均以离线组件或公开HTTP夹具复现。

- **[P2] “未开放”厕所仍进入附近推荐。** 规格 `spec.md:52` 要求“避开资料显示不可用”的地点。`src/server/rules.ts:172–174` 未识别单独“未开放”。正式CSV来源行9076（序号9071，东崔铸造厂公厕）备注为“未开放”、指标状况为“现有”；匹配位置并提供100秒路线后，HTTP仍返回 `matched`、详情 `availability=active`，会把游客引向不可用设施。
- **[P2] 过滤一个上游地点即提前结束分页。** `docs/prd/rules.md:31` 要求“候选未处理完时返回 hasMore”。`src/server/providers/amap.ts:227–232` 用过滤后的数量判断是否还有下一页。上游第一页25条包含24个北京地点和1个外地地点时，公开查询只返回10/10/4条便置 `hasMore=false`；第二页有效北京候选永不读取。
- **[P2] 切换语言清除附近选择。** `spec.md:33` 要求“切换语言时保留起点、需求、行程和选择”。`src/client/NearbyPage.tsx:263–269` 对包括语言的条件变化清除 `selectedId/showOthers`。选中卡片后切中文，即使返回相同ID，选中状态仍从true变false，普通候选也被收起。
- **[P2] 重复点击当前范围会静默停止补齐。** `spec.md:156–157` 要求短轮询补齐并准确表达 `pendingWork`。`src/client/NearbyPage.tsx:412–414` 无条件取消查询；再次点击已选10分钟不改变条件键，补拉不会重启。离线复现700ms后仍只有首个请求，页面持续显示正在补充分析。扩展半径控件同样受影响。

**已知未完成验收：** 故事61（`spec.md:105`）及 `docs/prd/acceptance.md:53` 的“至少在一个实际手机浏览器完成主线演示”未完成，已由 `docs/delivery/acceptance.md:16` 如实记录；这是验收缺口，不是代码修复项。

未发现新增范围膨胀。通用原文上下文保留符合已确认方向。未访问实际应用浏览器、未新增真实模型/地图调用。复现步骤与脚本见同目录 `final-spec-ui-evidence.md`、`spec-ui-probe.mjs` 及 `final-spec-data-probe.md/.mjs/.json`。

## 整改与复核

状态：整改中。上述四项 P2 与一项 P3 统一交给同一个实施代理，在 `codex/demo-final-fixes` 独立工作树修复；先通过已授权的公开 HTTP / 正式导入 / 离线 DOM 复现，再复核合入并发布。实际手机与最终实际应用浏览器的验收缺口保持未完成，不用代码改动或自动化结果替代。

原始审查和可复现实验暂存于 `/private/tmp/readytogo-demo-notes/final-standards-review.md`、`final-spec-review.md`、`final-spec-ui-evidence.md`、`spec-ui-probe.mjs`、`final-spec-data-probe.md`、`final-spec-data-probe.mjs` 与 `final-spec-data-probe.json`；修复后将保留对应的仓库回归入口。

汇总：Standards 1 项判断性发现（最高 P3）、硬性违规 0；Spec 4 项工程发现（最高 P2），另有 1 项已知实际手机验收缺口。
