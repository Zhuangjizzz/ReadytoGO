# 01: 真实数据进入最小附近查询

Status: ready-for-agent
Type: task
Stage: 1
Blocked by: None

Parent: [开发规格](../spec.md)

## What to build

从手选北京地点出发，看到由现有 CSV 与高德补充的真实候选和路线。

## Acceptance criteria

- [ ] 建立可启动、构建和检查的 React/TypeScript/Vite + Node 应用，遵循公开业务接口。
- [ ] 导入 GB18030 CSV，保留稳定 ID、来源与零/缺失，重复导入不重复实体。
- [ ] 地点搜索、本地召回、自动匹配、高德补充及真实步行路线贯通最小页面。
- [ ] 公开 HTTP 验证数据与查询；记录 red/green 循环，不用原型 fixture 作为产品数据。

## Execution constraints

- 使用独立工作树与分支，开始确认基于集成分支，完成前合入集成分支最新提交。
- 使用 tdd，在规格约定的公开 HTTP、正式导入及浏览器行为入口验证。用户授权直接执行，不重复询问。
- 实现通用输入行为，禁止按评测文本、具体景点或测试名称添加生产特例。
- 凭据不进入 Git 或日志，完整用户行程及精确位置不写日志。
- 完成提交代码及测试记录，交由独立 merger 与阶段 review。

## Comments
