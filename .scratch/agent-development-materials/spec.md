# Agent 开发资料准备

日期：2026-10-09。状态：资料整理完成，尚未实施产品 Agent。

## 用户要求

后续使用原生 OpenAI SDK 开发 Agent；沿用阿里模型。优先核对现有 Qwen skills 是否包含 Tool、Skill 和 Agent 开发方法，已有内容足够时复用。

## 核对结果与处理

- 原技能的 [API 参考](../../docs/agent-sdk/api-guide.md)已有 OpenAI SDK、工具 schema 和基本 Function Calling 示例；脚本可接收工具请求，但没有应用工具执行与完整 Agent 循环。
- 原参考的“最后一条消息必须是 user”与工具结果回传矛盾，已按官方多轮示例修正；收窄“所有代码兼容”的表述。
- 直接补充现有 [qianwen-text](../../.agents/skills/qianwen-text/SKILL.md)，新增 [Agent 开发参考](../../docs/agent-sdk/agent-development.md)，说明工具编写、循环、Skill 格式和产品运行时加载边界。
- 技能中的旧排序职责与首次引导口径已同步 [AI 契约](../../docs/prd/ai.md)及当前用户流程；产品需求本身未改动。
- [AGENTS.md](../../AGENTS.md) 增加按任务读取的入口。继续使用现有千问认证与模型配置，不另增一套 OpenAI Agent 技能。

## 官方依据

- [千问 OpenAI SDK 支持](https://platform.qianwenai.com/docs/api-reference/preparation/install-sdk)
- [千问 Function Calling](https://platform.qianwenai.com/docs/developer-guides/tool-calling/function-calling)：HTML 抓取超时，已通过同页官方 `.md` 正文核对 Python/Node.js、多轮回传和参数限制。
- [千问 Skill 编写](https://platform.qianwenai.com/docs/agent-infra/skills/introduction)
- [千问托管 Agent 的 Skill 接口](https://platform.qianwenai.com/docs/agent-infra/managed-agents/build-agent/skills)
- [OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling)：辅助核对 SDK 协议与编排职责，不用来证明百炼支持范围。

## 验证边界

本次仅准备资料。没有安装运行依赖、读取或修改密钥、调用模型/高德，亦未实现产品 Tool、Agent 或 Skill 加载器。已有基础连通记录见 [API 准备](../api-readiness/skill-setup.md)；后续仍按 [PRD 验收](../../docs/prd/acceptance.md)验证实际工具闭环和异常回退。

文档检查：26 个本地链接目标存在，`git diff --check` 通过。内置技能校验器因环境缺少 PyYAML 未能运行，已使用系统 Ruby YAML 解析器检查 frontmatter、名称、描述和占位内容，检查通过；保留原有 `compatibility` 字段。

## Comments

- 用户补充后，方向收敛为复用并补齐 Qwen 技能，而非另建 OpenAI 专用技能或切换模型服务商。
- 2026-10-09：按用户要求，将开发指南、API 参考和官方来源统一放到 `docs/agent-sdk/`，同步技能、AGENTS.md 与 README 的入口；`docs/agents/` 专用于仓库协作约定。迁移后 52 个本地链接及标题锚点检查通过，`git diff --check` 通过。
