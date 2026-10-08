# 07: 真实服务联调、运行说明与发布

Status: claimed
Type: task
Stage: 5
Blocked by: 02, 03, 04, 05, 06

Parent: [开发规格](../spec.md)

## What to build

交付可公开访问、可重复演示的完整应用和运行资料。

## Acceptance criteria

- [ ] 真实数据、地点、路线、AI 主线跑通，并检查关键异常恢复。
- [ ] 窄屏及可访问的实际移动设备验证如实记录，不能伪造真机通过。
- [ ] 按既有独立服务部署，长期服务凭据安全加载，检查页面/API/健康与回滚。
- [ ] 提供锁文件、启动构建配置、数据和 AI 记录、功能检查与已知限制。

## Execution constraints

- 使用独立工作树与分支，开始确认基于集成分支，完成前合入集成分支最新提交。
- 使用 tdd，在规格约定的公开 HTTP、正式导入及浏览器行为入口验证。用户授权直接执行，不重复询问。
- 实现通用输入行为，禁止按评测文本、具体景点或测试名称添加生产特例。
- 凭据不进入 Git 或日志，完整用户行程及精确位置不写日志。
- 完成提交代码及测试记录，交由独立 merger 与阶段 review。

## Comments

功能依赖已合入 `fcec886`。从最新集成分支建立 `codex/demo-07-delivery`，使用已准备的 `demo-delivery` 工作树。发布预检及执行草稿在 `/private/tmp/readytogo-demo-notes/delivery-preflight.md`；仅使用既有独立服务与端口，补通用 HOST 配置以支持回环预发布。浏览器预览拒绝及未完成的真机验收须继续明确记录。
