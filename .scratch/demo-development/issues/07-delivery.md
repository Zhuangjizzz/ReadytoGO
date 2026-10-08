# 07: 真实服务联调、运行说明与发布

Status: resolved
Type: task
Stage: 5
Blocked by: 02, 03, 04, 05, 06

Parent: [开发规格](../spec.md)

## What to build

交付可公开访问、可重复演示的完整应用和运行资料。

## Acceptance criteria

- [x] 真实数据、地点、路线、AI 主线跑通，并检查关键异常恢复。
- [x] 窄屏及可访问的实际移动设备验证如实记录，不能伪造真机通过。
- [x] 按既有独立服务部署，长期服务凭据安全加载，检查页面/API/健康与回滚。
- [x] 提供锁文件、启动构建配置、数据和 AI 记录、功能检查与已知限制。

## Execution constraints

- 使用独立工作树与分支，开始确认基于集成分支，完成前合入集成分支最新提交。
- 使用 tdd，在规格约定的公开 HTTP、正式导入及浏览器行为入口验证。用户授权直接执行，不重复询问。
- 实现通用输入行为，禁止按评测文本、具体景点或测试名称添加生产特例。
- 凭据不进入 Git 或日志，完整用户行程及精确位置不写日志。
- 完成提交代码及测试记录，交由独立 merger 与阶段 review。

## Comments

功能依赖已合入 `fcec886`。从最新集成分支建立 `codex/demo-07-delivery`，使用已准备的 `demo-delivery` 工作树。发布预检及执行草稿在 `/private/tmp/readytogo-demo-notes/delivery-preflight.md`；仅使用既有独立服务与端口，补通用 HOST 配置以支持回环预发布。浏览器预览拒绝及未完成的真机验收须继续明确记录。

- 2026-10-09：在基于 `5994096` 的 `codex/demo-07-delivery` 开始实施。测试边界按用户和规格已授权的进程启动及公开 HTTP：用隔离正式导入目录启动服务，验证 HOST 配置决定实际监听地址。凭据不进入测试。

- 发布前运行检查：HOST启动进程+真实HTTP用例先因固定0.0.0.0失败，加入通用HOST后通过。当前92项默认测试、typecheck、生产build均通过；本机Node26.8.1，远程Node24.15.0。已保存有界真实AI摘要及未满足的真机验收；以下发布结果将另行追加。

## Answer

已完成全部可执行工程交付。最终运行版本 `2fafc9c14934cccbde188a8613cf7ac8b85435e2` 已通过独立 release/current 与 `readytogo.service` 发布；真实回环 stage、公网健康/资产、旧业务版本 `c82770b` 回切及恢复新版均已验证。正式服务 active/running/enabled，smoke inactive/disabled；七个运行文件与集成构建一致，凭据继续由 0600 文件加载。发布文件所有权已规范为 root:root，其他项目和持久状态所有权保持原状。

工单初始提交 `5c6bfd4`、最终审查修复 `76b29da` 和发布证据 `9f6a9e0` 已分别合入集成分支，最终文档合并提交为 `13c032e`。完整 **120/120** 测试、类型检查和构建通过；最终 Standards 的一项 P3 与 Spec 的四项 P2 全部修复并由原独立审查者复核关闭，没有工程未决项，见[阶段 5 review](../reviews/stage5.md)。

第一次发布前的漏备注失败保留，通用原文上下文修复及真实复验已有独立证据。最终二次发布首次地点请求返回 503，尚未调用模型；一次有界重试后首批十条路线和 AI 分析通过。根因未被确定，不将等待时长当作已证实网络原因。公网回切没有重复调用地图或模型，根另行确认最终公网健康与未开放记录的缓存详情状态。

永久材料：[交付验收](../../../docs/delivery/acceptance.md)、[最终发布及证据](../../../docs/delivery/final-review-release.md)、[历史发布记录](../../../docs/delivery/deployment-record.md)、[AI 摘要](../../../docs/delivery/ai-evidence.md)及根 README。

本工单的设备验证记录条件已完成；原规格第 61 项、阶段 5 实际手机主线和最终实际应用浏览器/视觉验收仍未完成。Browser Use 拒绝未被绕过，未将 HTTP 或离线 DOM 结果代替真机验收。父规格保留待实际手机验收状态。
