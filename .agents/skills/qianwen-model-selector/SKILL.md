---
name: qianwen-model-selector
description: 为 ReadytoGo 选择千问文本模型，权衡结构化输出、多语理解、延迟和成本；核对已有模型配置。
compatibility: 通过官方文档选型；无需 CLI。账户配额查询不在当前裁剪范围。
---

# ReadytoGo 千问模型选择

来源与裁剪见 UPSTREAM.md。模型任务以 [Demo AI 细则](../../../docs/prd/ai.md)为准：中英行程解析、设施分析、推荐说明及按需资料匹配。

1. 用户指定模型时先核对其准确 ID 和所需能力；已有经测试的 `QWEN_MODEL` 不因上游默认变化而自动替换。
2. 选择新模型前读取[官方文本目录](https://alioth.alicdn.com/skills-info/models/references/qianwen-text-models.md)和[结构化输出说明](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。无法联网时才使用 `cdn/references/qianwen-text-models.md`，说明快照局限。
3. 优先满足中英文本理解、结构化输出和 Demo 交互延迟。一次小规模测试确认模型在用户 Key 和地域下可调用；公共模型目录不能证明账户权限。
4. 解析用业务枚举测试，解释用事实一致性测试。JSON 语法通过不代表业务有效。在线超时回退手动编辑与规则说明，离线工作单独设置批次和预算。
5. 固定模型时记录 ID、来源、测试时间和参数；当前价格、额度及限流以官方实时数据或账户信息为准，不把静态快照当作账户余额。

当前未安装用量、支付、媒体生成或部署技能。若用户要账户用量/账单的 CLI 查询，再按官方说明安装 `@qianwenai/qianwen-cli` 并单独浏览器登录；现有 API Key 不能替代该会话。
