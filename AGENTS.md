## Agent skills

### Issue tracker

需求与任务使用本地 Markdown，存放在 `.scratch/<feature-slug>/`。处理需求或任务时，先读 `docs/agents/issue-tracker.md`。

### Triage labels

采用五个默认 triage 标签；评估任务或更新分诊状态时，先读 `docs/agents/triage-labels.md`。

### Domain docs

采用 single-context 布局：根目录 `GLOSSARY.md` 与 `docs/adr/`。探索代码前，先读 `docs/agents/domain.md`。

### Product requirements

调整需求、实现业务或编写验收时，先读 [Demo PRD](docs/prd/README.md)，再按任务读取细则。追溯范围取舍时读[决策记录](.scratch/prd-v1-alignment/spec.md)。

### UI design

创建或调整界面时，先读 [ReadytoGo 设计使用约定](DESIGN.md#readytogo-使用约定)，并参考 [UI Demo](docs/ui/index.html) 的对应页面与交互。

### Product Agent development

使用原生 OpenAI SDK 接入千问、编写工具调用或产品 Agent 时，先读 [Agent SDK 开发指南](docs/agent-sdk/agent-development.md)；调用技能见 [qianwen-text](.agents/skills/qianwen-text/SKILL.md)。

### Deployment

部署、回滚或排查远程访问时，先读 [部署流程](docs/deployment/deployment.md)。
