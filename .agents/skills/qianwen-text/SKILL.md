---
name: qianwen-text
description: 使用千问文本 API 开发和验证 ReadytoGo 的多语情况解析、需求微调、推荐解释及离线名称翻译。
compatibility: Python 3.9+，仅标准库；从项目根目录读取 .env，无需千问 CLI。
---

# ReadytoGo 千问文本接入

本技能基于 QianWen-AI/qianwen-ai，按北京版 PRD 第 4、6.3 节裁剪。来源与修改见 UPSTREAM.md。

## 执行

1. 从项目根目录运行；用 `qianwen-ops-auth` 检查配置状态，只报告已配置/未配置及错误码。
2. 优先使用用户指定的模型，其次使用 `.env` 的 `QWEN_MODEL`。没有模型时使用 `qianwen-model-selector` 查官方目录；成功联调后才固定默认值。
3. 先运行本技能 `scripts/text.py --help`。脚本使用绝对路径，支持 `--file` 或 `--request` 请求 JSON、`--model`、`--timeout` 和 `--output`。请求文件可放 `.scratch/api-readiness/`，结果写项目 `output/`。
4. 情况解析显式传 `enable_thinking: false`、有限 `max_tokens` 和所选模型支持的 `response_format`。在线调用按 PRD 设置短超时；离线翻译另设超时并控制批量规模。
5. 成功条件为进程退出码 0、响应含 `choices` 且内容通过业务校验。鉴权失败核对地域、Host 和模型授权；限流停止本批并退避；模型不可用时报告错误，不轮询猜测模型。

## 项目边界

- 模型把用户原文作为数据，映射 PRD 的偏好枚举；首次引导确认后保存，微调提供 Undo。
- 排序、设施等级、坐便证据、步行耗时由应用规则产生。解释仅引用传入候选 ID、事实及理由码；校验失败退回模板。
- 离线翻译保留中文原名和地址，抽检后缓存；界面、询问卡和贴士使用审核后的静态文案。
- 产品后端使用普通模型调用 Key。Token Plan 不作为本项目后端凭据。
- Key 仅从服务端环境或 `.env` 读取，命令参数、日志、Git、前端代码均不写入值。
- 本技能用于开发调用，不是生产服务端实现。原始模型响应和脚本输出不能直接作为面向游客的结果。

## 按需参考

- `references/api-guide.md`：参数和结构化输出；所选模型能力仍须以官方文档和实测为准。
- `references/sources.md`：官方文档来源。
- [文本模型目录](https://alioth.alicdn.com/skills-info/models/references/qianwen-text-models.md)：选型时读取；联网失败才使用 `cdn/references/qianwen-text-models.md`，并说明是快照。

本项目未启用自动更新提示或自动安装其他技能；更新时显式核对上游，并保留本项目修改。
