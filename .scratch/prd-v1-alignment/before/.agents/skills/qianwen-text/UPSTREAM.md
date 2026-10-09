# 来源与本地修改

来源：https://github.com/QianWen-AI/qianwen-ai
固定提交：7a7a6ddaa6320361776e4d10540147fa1abdd797
许可证：Apache-2.0，见 LICENSE。
本地修改日期：2026-10-08。

按 ReadytoGo 北京 PRD 保留文本/认证/文本模型选型；删除当前项目不需要的媒体、支付、部署、强制 CLI 登录及更新提示分支。文本执行器要求显式模型配置，增加有界 HTTP 超时并移除自动更新钩子。上游文档与安装清单保存在项目 `.scratch/api-readiness/skill-sources/`。这是项目裁剪版，更新时需重新应用并验证本地改动。

2026-10-09：按用户“原生 OpenAI SDK + 阿里模型”的开发方向，补充 [Agent 开发参考](../../../docs/agent-sdk/agent-development.md)和官方 Tool/Skill 阅读入口；修正工具回传必须以 user 消息结尾及全面兼容的过度表述，技能业务边界同步当前 PRD。仅调整开发资料，没有修改执行脚本、安装 SDK、调用模型或变更凭据。

同日按用户目录约定，将开发指南、API 参考与来源索引统一迁至 `docs/agent-sdk/`；本技能保留调用入口、脚本与运行所需的 CDN 快照。
