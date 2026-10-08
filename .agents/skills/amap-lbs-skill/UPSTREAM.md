# 来源与本地修改

官方说明：https://developer.amap.com/api/skill/ready-to-use/summary
官方压缩包：https://a.amap.com/jsapi/static/openClaw/amap-lbs-skill.zip
压缩包 SHA-256：a15e295b93abe069ca59c7e3cb1d9580bcf8ca038e7503710e0d88a4d3a3a3da
原包 package.json 版本：1.0.0，声明许可证 MIT。
本地修改日期：2026-10-08。

保留 LBS 接入，删除旅游编排、热力图、驾车/公交/骑行和遥测指令。原包的搜索函数固定走 place/text、分页参数与 v5 不一致，步行使用 v3；项目新建使用 Node 原生 fetch 的 text/around/walking/convert 联调脚本，明确 v5 参数和 cost.duration。改用 v5 是实现选择，不表示 v3 不可用；移除 Axios 只是减少依赖。移除明文 config.json 写入路径，统一读取环境变量。本项目裁剪版无需 OpenClaw、ClawHub 或高德 CLI。上游 SKILL 及安装清单见 `.scratch/api-readiness/skill-sources/`。用户随后明确当前阶段仅要求接口可用和基础搜索，完整 PRD 规则留待产品开发。

2026-10-09：按用户确认的 Demo 范围同步产品指针与职责，移除旧业务流程的重复约束；调用脚本、凭据和供应商配置未变更。当前行为以 `docs/prd/` 为准。
