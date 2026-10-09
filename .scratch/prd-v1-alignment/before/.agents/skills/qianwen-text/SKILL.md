---
name: qianwen-text
description: 使用原生 OpenAI SDK 和千问模型开发 ReadytoGo 的工具调用、Agent 循环、结构化推荐及离线翻译；包含产品技能编写参考。纯 Codex 技能编写使用 skill-creator。
compatibility: 附带联调脚本使用 Python 3.9+ 标准库；产品开发使用原生 openai SDK，从服务端配置读取模型与凭据，无需千问 CLI。
---

# ReadytoGo 千问文本接入

本技能基于 QianWen-AI/qianwen-ai，来源与本地修改见 UPSTREAM.md。业务以[当前 PRD](../../../docs/ReadytoGo-PRD-v2.0-Beijing.md)及其细则为准。

## 产品 Agent 开发

开发工具定义、多轮工具回传、结构化推荐或产品 Skill 时，先读 [Agent 开发参考](../../../docs/agent-sdk/agent-development.md)。主线是原生 `openai` SDK 接入既有千问服务，由产品服务端执行工具与维护循环；SDK 选择不改变既有服务商和模型配置。

用 `openai-docs`（可用时）核对 SDK 接口；千问支持的端点、参数和模型能力以本技能链接的千问官方文档为准。先核对现有依赖与配置，再做本次必要的实现。`scripts/text.py` 用于模型请求联调，接收 `tool_calls`，不负责执行工具或驱动完整 Agent 循环。

## 模型请求联调

1. 从项目根目录运行；用 `qianwen-ops-auth` 检查配置状态，只报告已配置/未配置及错误码。
2. 优先使用用户指定的模型，其次使用 `.env` 的 `QWEN_MODEL`。没有模型时使用 `qianwen-model-selector` 查官方目录；成功联调后才固定默认值。
3. 先运行本技能 `scripts/text.py --help`。脚本使用绝对路径，支持 `--file` 或 `--request` 请求 JSON、`--model`、`--timeout` 和 `--output`。请求文件可放 `.scratch/api-readiness/`，结果写项目 `output/`。
4. 简单情况解析使用 `enable_thinking: false`、有限 `max_tokens` 和所选模型支持的 `response_format`；Agent 工具循环的思考及工具参数按官方能力和样例验证选择。在线调用显式设置超时；离线翻译另设超时并控制批量规模。
5. 成功条件为进程退出码 0、响应含 `choices` 且内容通过业务校验。鉴权失败核对地域、Host 和模型授权；限流停止本批并退避；模型不可用时报告错误，不轮询猜测模型。

## 项目边界

- 用户原文、标签和已保存的显式偏好构成本次需求；首页直接查询，保存偏好由用户确认，微调可撤销。见[用户流程](../../../docs/prd/experience.md)。
- AI 调用高德、按名称召回本地资料并判断对应记录，在满足硬性要求的候选中排序和解释；服务端校验事实与条件。具体职责、输出与回退按 [AI 契约](../../../docs/prd/ai.md)和[异常行为](../../../docs/prd/acceptance.md#异常行为)执行。
- 离线翻译保留中文原名和地址，抽检后缓存；界面、询问卡和贴士使用审核后的静态文案。
- 产品后端使用普通模型调用 Key。Token Plan 不作为本项目后端凭据。
- Key 仅从服务端环境或 `.env` 读取，命令参数、日志、Git、前端代码均不写入值。
- 本技能用于开发调用，不是生产服务端实现。原始模型响应和脚本输出不能直接作为面向游客的结果。

## 按需参考

- [API 参考](../../../docs/agent-sdk/api-guide.md)：参数和结构化输出；所选模型能力仍须以官方文档和实测为准。
- [Agent 开发参考](../../../docs/agent-sdk/agent-development.md)：原生 SDK 的工具定义、Agent 循环、Skill 编写和官方阅读路径。
- [官方来源](../../../docs/agent-sdk/sources.md)：官方文档来源。
- [文本模型目录](https://alioth.alicdn.com/skills-info/models/references/qianwen-text-models.md)：选型时读取；联网失败才使用 `cdn/references/qianwen-text-models.md`，并说明是快照。

本项目未启用自动更新提示或自动安装其他技能；更新时显式核对上游，并保留本项目修改。
