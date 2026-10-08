# 07: 真实服务联调、运行说明与发布

Status: claimed
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

已完成全部可执行工程交付。运行版本 `c82770b6be6d70e3da20a81cdd0d1f196841c008` 在独立release/current与readytogo.service发布，真实回环stage→公网健康/资产/地点/首批preview→smoke回滚→恢复正式服务均通过。凭据经SSH stdin进入0600文件，Linux安装76项生产依赖，当前正式服务active/enabled；80/8080及网络配置保持原状。

首次stage漏备注触发通用修复；旧失败记录保留，修复后唯一必要parse复验按完整原文source_context、地点与需求检查通过。最终运行代码111项默认测试、check、build通过。永久[交付验收](../../../docs/delivery/acceptance.md)、[发布记录与证据](../../../docs/delivery/deployment-record.md)、[AI摘要](../../../docs/delivery/ai-evidence.md)及README已完成。

工单的“如实记录设备验证”条件已完成；原规格第61项和阶段5实际手机退出条件仍未通过，实际应用Browser Use拒绝未绕过。本交接不将完整规格或真机验收标为全部通过。工单分诊状态由root在集成及最终整分支Standards/Spec审查后更新。
