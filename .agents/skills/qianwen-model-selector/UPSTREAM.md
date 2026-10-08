# 来源与本地修改

来源：https://github.com/QianWen-AI/qianwen-ai
固定提交：7a7a6ddaa6320361776e4d10540147fa1abdd797
许可证：Apache-2.0，见 LICENSE。
本地修改日期：2026-10-08。

按 ReadytoGo 北京 PRD 保留文本/认证/文本模型选型；删除当前项目不需要的媒体、支付、部署、强制 CLI 登录及更新提示分支。文本执行器要求显式模型配置，增加有界 HTTP 超时并移除自动更新钩子。上游文档与安装清单保存在项目 `.scratch/api-readiness/skill-sources/`。这是项目裁剪版，更新时需重新应用并验证本地改动。

2026-10-09：按用户确认的 Demo 范围同步产品指针与职责，移除旧业务流程的重复约束；调用脚本、凭据和供应商配置未变更。当前行为以 `docs/prd/` 为准。
