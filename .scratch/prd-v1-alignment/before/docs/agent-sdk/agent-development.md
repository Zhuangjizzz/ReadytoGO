# 千问 + 原生 OpenAI SDK 的 Agent 开发参考

核对日期：2026-10-09。本文补充现有 `qianwen-text`，用于后续实现；本次未运行产品 Agent。

配套资料：[API 参考](api-guide.md) · [官方来源](sources.md)。本目录存放产品 Agent SDK 开发资料；仓库协作约定位于 `docs/agents/`。

## 接入选择

千问官方支持 OpenAI SDK，并提供 Python、Node.js 的 Function Calling 示例，包括多轮调用与结果回传。[SDK 安装](https://platform.qianwenai.com/docs/api-reference/preparation/install-sdk) · [Function Calling](https://platform.qianwenai.com/docs/developer-guides/tool-calling/function-calling)

本项目沿用 `DASHSCOPE_API_KEY`、`QWEN_BASE_URL`、`QWEN_MODEL`，使用基础 `openai` SDK。已验证的接入记录是百炼 Chat Completions 的短 JSON 请求，见[配置与验证记录](../../.scratch/api-readiness/skill-setup.md)。官方示例的域名和模型仅供参考，不覆盖项目配置；具体模型的工具调用、结构化输出与延迟仍需联调。

基础 SDK 的函数调用由应用执行工具并回传；Agents SDK 可另行负责运行循环。[OpenAI 函数调用](https://developers.openai.com/api/docs/guides/function-calling) · [Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk)。本项目先由服务端实现当前 PRD 所需循环；采用框架、Responses 或托管 Agent 是独立实现选择，须核对千问对应端点与能力。

## Tool、Agent 与 Skill

| 概念 | 本项目中的用途 | 开发时维护的内容 |
| --- | --- | --- |
| Tool | 高德搜索、本地名称检索、详情与路线查询 | 描述、参数 schema、服务端执行函数和结果契约 |
| Agent | 理解需求，选择工具，读取结果，继续查询并组织推荐 | 指令、消息历史、工具注册表、执行循环与终止条件 |
| Skill | 复用某类任务的方法和参考资料 | 带名称及适用条件的 `SKILL.md`，按需附带参考或脚本 |

Skill 是供支持该机制的宿主读取的技能包；千问托管 Agent 的 Skill 上传、挂载和版本管理有独立接口。[Skill 简介](https://platform.qianwenai.com/docs/agent-infra/skills/introduction) · [Agent Skills](https://platform.qianwenai.com/docs/agent-infra/managed-agents/build-agent/skills)

仓库 `.agents/skills/` 供开发助手使用。产品的 `chat.completions.create` 接入由应用显式提供消息和 tools；若产品也要使用 Skill，由自管运行时实现发现和加载，并把必要指令及工具纳入当前请求。目录中存在 `SKILL.md` 不等于游客使用的 Agent 已加载它。当前 PRD 不要求先做通用 Skill 平台。

## 如何写 Tool

Chat Completions 的工具声明使用 `type: "function"`，在 `function` 内放 `name`、`description`、`parameters`。`parameters` 是描述输入的 JSON Schema；模型返回函数名和 JSON 字符串参数，应用负责执行。完整 Python/Node.js 示例见[千问 Function Calling](https://platform.qianwenai.com/docs/developer-guides/tool-calling/function-calling)。

本项目的设计与验证要点：

1. 按 [PRD 工具职责](../prd/ai.md#工具职责)划分工具。描述写清何时调用、输入来源、返回内容和不适用情形。
2. 参数表达类型、单位、枚举和必填项；坐标注明坐标系，政府记录 ID 与高德 POI ID 分开。实际执行前用服务端 schema 与业务规则校验。
3. 使用固定工具注册表分派函数。模型提供的名称或参数不直接作为可执行代码、任意 URL 或文件路径。
4. 工具返回有限、可追溯的数据：候选 ID、字段来源、取数时间、覆盖情况和错误状态。失败与成功空结果分开表示，契约按[数据与接口](../prd/data-and-api.md)实现。
5. 检索负责召回，AI 负责判断对应记录与推荐，服务端负责事实和硬性条件校验；避免用工具实现替换 PRD 指定的 AI 职责。

## 如何写 Agent 循环

以下消息顺序来自[千问官方多轮示例](https://platform.qianwenai.com/docs/developer-guides/tool-calling/function-calling)，运行边界为项目实现要求。

1. 用用户原文、显式偏好、已确认起点和语言建立本次上下文，发送 `messages` 与 `tools`。
2. 读取 `choices[0].message`。先把带完整 `tool_calls` 的 assistant 消息加入历史，保留所选模型要求的额外字段。
3. 遍历本轮全部调用，解析并校验 `function.arguments`，执行已注册工具。每个调用按其 `id` 回传一条 `role: "tool"`、`tool_call_id` 匹配、`content` 为结果字符串的消息。
4. 所有本轮结果回传后，再用更新后的 `messages` 和 tools 调用模型。结果回传时最后一条消息可以是 `tool`，不能强行插入虚构的 user 消息。
5. 无工具调用时，只有完整结果通过 schema 和[服务端事实校验](../prd/ai.md#服务端校验)才成功结束。拒绝、截断、空输出或无效 ID 均须进入相应错误处理。
6. 对总耗时、模型轮数、工具次数、并发和重试设置边界；无进展或预算耗尽时执行 [PRD 回退](../prd/acceptance.md#异常行为)。具体数值通过样例确定并记录。

独立工具可并发；后续调用依赖前序召回/选择结果时按依赖执行。流式工具参数需按调用标识聚合完整再解析，结果卡仍须经过校验。千问的 `tool_choice`、`parallel_tool_calls`、思考模式组合有模型限制，按[官方说明](https://platform.qianwenai.com/docs/developer-guides/tool-calling/function-calling)核对，不能仅凭 SDK 接受参数就视为有效。

工具入参 schema 与最终页面结果 schema 分开维护。支持 JSON 输出不等于支持全部 strict schema 约束，更不等于事实正确；参数支持范围按[千问结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)核对，事实及硬性要求按 PRD 校验。

## 如何写 Skill

编写规范见[千问 Skill 简介](https://platform.qianwenai.com/docs/agent-infra/skills/introduction)。最小结构是 YAML frontmatter 的 `name`、`description` 加 Markdown 正文：

```markdown
---
name: match-local-toilet
description: 根据高德厕所信息与本地名称召回结果判断对应记录，供详情补充使用。
---

# 本地资料关联

按当前 AI 契约读取候选与召回资料，输出所选记录及判断依据。
引用现有数据，按实现约定表达无匹配或多匹配，不生成不存在的记录 ID。
```

这是写法示意，不是已安装的产品技能。实际技能写清输入、适用条件、需要的工具、执行方法、输出和完成条件；长参考放在单独文件中按需读取，业务规则链接 PRD，避免复制后漂移。

给 Codex 写开发用 Skill 时，使用已有 `skill-creator` 和 `writing-for-agents`；给产品写 Skill 时，只加载该产品需要的内容与已注册工具。开发环境的凭据、部署命令和本机操作权限不随技能正文进入产品运行上下文。

## 后续实现的验收入口

按[验收细则](../prd/acceptance.md)至少验证一条“高德搜索 → 名称召回 → AI 选择 → 详情/路线 → 结构化推荐 → 服务端校验”的真实闭环，并覆盖：

- 本轮多个工具调用全部回传，依赖次序正确。
- “不能蹲”“近一点”和语言切换保持显式硬性要求。
- 非法参数、未知工具、未召回 ID、伪造设施或分钟数被拒绝。
- 单工具失败、模型超时、截断和循环上限保留有效结果并正确回退。

本地模型请求脚本只验证调用与响应，不能替代上述产品验收。
