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

未发现新增范围膨胀。通用原文上下文保留符合已确认方向。未访问实际应用浏览器、未新增真实模型/地图调用。复现步骤与脚本见 `/private/tmp/readytogo-demo-notes/` 中的 `final-spec-ui-evidence.md`、`spec-ui-probe.mjs` 及 `final-spec-data-probe.md/.mjs/.json`。

## 整改与复核

状态：整改与独立复核完成，等待最终修复版本二次发布。上述四项 P2 与一项 P3 统一由同一个实施代理在 `codex/demo-final-fixes` 独立工作树修复；通过已授权的公开 HTTP / 正式导入 / 离线 DOM 复现并验证。实际手机与最终实际应用浏览器的验收缺口保持未完成，不用代码改动或自动化结果替代。

原始审查和可复现实验暂存于 `/private/tmp/readytogo-demo-notes/final-standards-review.md`、`final-spec-review.md`、`final-spec-ui-evidence.md`、`spec-ui-probe.mjs`、`final-spec-data-probe.md`、`final-spec-data-probe.mjs` 与 `final-spec-data-probe.json`；修复后将保留对应的仓库回归入口。

汇总：Standards 1 项判断性发现（最高 P3）、硬性违规 0；Spec 4 项工程发现（最高 P2），另有 1 项已知实际手机验收缺口。

### 实施修复与交付前验证

同一实施分支 `codex/demo-final-fixes` 以 `76b29da` 完成全部五项整改，基于集成 `e3ed7f5`；独立复核后已合入 `2fafc9c`，等待二次发布。

- 来源状态：正式导入与运行时共同识别未开放、尚未启用及明确重新开放，保留历史/否定和周期营业边界。`tests/query-rules.test.ts` 新增公开HTTP回归先失败后通过，`tests/import.test.ts` 补正式CLI导入至公开详情验证。原CSV审查对象复验不再进入推荐，详情为 `out_of_service`，原备注保留。
- 供应商分页：依据过滤前的原始页规模判断剩余页；全页被过滤不代表原始结果耗尽。`tests/provider.test.ts` 两项HTTP回归先失败后通过，分别覆盖24个北京+1个外地后的第二页，以及连续全过滤页后的有效结果与8页上限。原审查探针现在请求第1、2页并返回25个有效候选。
- 语言刷新：条件身份与显示语言分开。保留选择、普通候选展开和地图视角，旧语言理由立即移除；根据原已加载页数有界刷新，后页选择在刷新过程中继续可见，不自动扫描新页。`tests/dom/nearby.test.tsx` 覆盖地图缩放/平移、后页选择、语言说明替换及不越过原加载范围。
- 同值控件：相同范围、需求、进入条件或起点为无操作，不停止当前批次。离线DOM验证同值点击后补齐完成，既有改变条件/迟到响应回归仍通过。
- 合并复用：附近与规划使用同一纯合并模块，保持排序、状态和最新游标规则；新增公开UI回归覆盖分页高德别名被规范ID替换、选择保留、无重复卡片与分页终止。原规划回归继续通过。

验证：完整 `npm test` **119/119**，`npm run check`、`npm run build`、`git diff --check` 全部通过。数据审查探针复验记录另存于 `/private/tmp/readytogo-demo-notes/final-spec-data-recheck.mjs` 与 `.json`，原失败证据未覆盖。本轮没有新增真实API/模型调用或实际应用浏览器访问；上述结果不替代未完成的实际手机验收。

独立merger随后补出语言刷新的空 `pendingWork=true` 首响应边界。新增DOM回归先失败后通过：当前刷新页仍保留原有来源候选，旧语言理由不出现；新响应同ID/规范ID资料优先，终态再替换。merger另行确认终态明确耗尽时旧页被移除，未越过原刷新范围。最新完整测试 **120/120**、类型检查、构建和差异检查通过。独立探针为 `/private/tmp/readytogo-demo-notes/final-fixes-language-pending-probe.mjs`、`final-fixes-language-exhausted-probe.mjs`，没有新增实际应用浏览器或真实API调用。


### 最终独立复核

`76b29da` 已由merger合入 `2fafc9c14934cccbde188a8613cf7ac8b85435e2`。合并后完整 **120/120** 测试、类型检查和构建通过。两个原审查代理分别检查最终修复，未读取彼此结果；工程未决发现为零。

| 轴 | 原发现 | 复核结果 | 永久报告 |
| --- | --- | --- | --- |
| Standards | 1 项 P3 判断项，0 项硬性违规 | 共享合并已完成；新增发现 0 | [Standards 复核](final-standards-recheck.md) |
| Spec | 4 项 P2 工程问题 | 原始复现转绿，4 项均关闭；无新实际回归 | [Spec 复核](final-spec-recheck.md) |

两个轴的结论分别保留。Spec 的实际手机主线验收缺口仍未关闭；发布结果将由 [发布记录](../../../docs/delivery/deployment-record.md)继续补录。

汇总：Standards 原 1 项 P3 已关闭，未决 0；Spec 原 4 项 P2 已关闭，工程未决 0，实际手机验收仍未完成。
