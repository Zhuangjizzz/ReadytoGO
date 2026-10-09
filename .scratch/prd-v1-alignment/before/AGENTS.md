## Agent skills

### Issue tracker

需求与任务使用本地 Markdown，存放在 `.scratch/<feature-slug>/`。处理需求或任务时，先读 `docs/agents/issue-tracker.md`。

### Triage labels

采用五个默认 triage 标签；评估任务或更新分诊状态时，先读 `docs/agents/triage-labels.md`。

### Domain docs

采用 single-context 布局：根目录 `GLOSSARY.md` 与 `docs/adr/`。探索代码前，先读 `docs/agents/domain.md`。

### Product requirements

调整需求、实现业务或编写验收时，先读 [PRD 总入口](docs/ReadytoGo-PRD-v2.0-Beijing.md)，再按其中索引读取对应细则。需要追溯范围取舍时，读取 [决策记录](.scratch/prd-restructure/spec.md)；实现以当前 PRD 细则为准。

### UI design

创建或调整界面时，先读 `DESIGN.md` 的 ReadytoGo 使用约定及相关组件章节。当前采用 Uber 模板作为临时参考，最终视觉方向由设计人员确认；业务流程与信息口径以 PRD 对应细则为准。

### Product Agent development

使用原生 OpenAI SDK 接入千问、编写工具调用或产品 Agent 时，先读 [Agent SDK 开发指南](docs/agent-sdk/agent-development.md)；调用技能见 [qianwen-text](.agents/skills/qianwen-text/SKILL.md)。

### Deployment

部署、回滚或排查远程访问时，先读 [部署流程](docs/deployment/deployment.md)。
