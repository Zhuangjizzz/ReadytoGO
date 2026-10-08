# 01: 真实数据进入最小附近查询

Status: resolved
Type: task
Stage: 1
Blocked by: None

Parent: [开发规格](../spec.md)

## What to build

从手选北京地点出发，看到由现有 CSV 与高德补充的真实候选和路线。

## Acceptance criteria

- [x] 建立可启动、构建和检查的 React/TypeScript/Vite + Node 应用，遵循公开业务接口。
- [x] 导入 GB18030 CSV，保留稳定 ID、来源与零/缺失，重复导入不重复实体。
- [x] 地点搜索、本地召回、自动匹配、高德补充及真实步行路线贯通最小页面。
- [x] 公开 HTTP 验证数据与查询；记录 red/green 循环，不用原型 fixture 作为产品数据。

## Execution constraints

- 使用独立工作树与分支，开始确认基于集成分支，完成前合入集成分支最新提交。
- 使用 tdd，在规格约定的公开 HTTP、正式导入及浏览器行为入口验证。用户授权直接执行，不重复询问。
- 实现通用输入行为，禁止按评测文本、具体景点或测试名称添加生产特例。
- 凭据不进入 Git 或日志，完整用户行程及精确位置不写日志。
- 完成提交代码及测试记录，交由独立 merger 与阶段 review。

## Comments

## Answer

工单已在 `codex/demo-01-data-nearby` 完成，基于指定集成基线 `8cce9f0`；交付独立合并与阶段审查。工程、正式导入、共享契约、真实高德适配、自动资料关联、有限批次路线与 React 地点选择/附近页面已贯通。

执行记录及真实响应摘要见 [数据处理记录](../../../docs/data-processing.md)。导入 13,156 行 → 13,124 实体，32 行合并；原始位置与高德 GCJ02 分开。

Red → green：缺少 app 实现 → 正式 CLI 导入与 HTTP 详情通过；缺少查询路由 → 地点选择/本地匹配/路线部分失败通过；完整原始 CSV 未转义秒符导致导入失败 → 13,156 行完整导入；旧缓存回写覆盖新设施的失败回归 → 缓存只恢复位置/供应商字段。独立阶段审查的路线异常、日志关联问题一并修复。

真实限流诊断保留 `10021 / CUQPS_HAS_EXCEEDED_THE_LIMIT`；初始 5 并发的 10 条请求出现 5 成功/5 限流，统一起始节流经 250ms、350ms 仍见少量失败，最终采用保守 500ms，并保留部分结果与显式重试。`200304` 实际为母婴室，已从成人厕所查询及旧缓存排除。未加入任何景点特例。

已运行 `npm test`、`npm run check`、`npm run import:data`、`npm run build`；正式 HTTP 真实什刹海查询取得 CSV+高德双来源及实际步行数值。390×844 Chrome 模拟完成英文北京动物园搜索、选点和附近列表，0 脚本错误、无横向溢出；真机验收属于 07。

工单 02 后续扩展五组/设施否定与冲突/开放规则/完整有界游标；03 接入真实地图定位导航；05 增加 AI。所有外部凭据仅由已存在的主仓库 `.env` 注入进程。

500ms 起始间隔的最终有界真实复验：10 条路线均返回 `success`；不据此承诺供应商始终成功。

### 阶段审查修复：门牌身份

merger 发现旧地址包含判断可把 1 号误匹配到 10 号，并忽略坐标冲突。新增正式导入→HTTP 的通用数字边界回归，先观测 6 条失败，再按完整门牌号、完整道路名、同区县及已知位置相容性修复；同门牌的附加入口文字仍允许匹配。匹配规则版本 2 丢弃旧宽松关联缓存。`npm test` 的 15 个测试、`npm run check`、`npm run build` 均通过。

## Resolution

Integration: `307a2506c704f08c955627bbbf08ca83850113c3`. Independent review fixes verified; 15 tests, typecheck, build and formal import passed. Real provider checks and 390px browser evidence are recorded in `docs/data-processing.md`.
