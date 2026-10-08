# ReadytoGo 技能安装与配置

日期：2026-10-08（Asia/Shanghai）。范围：按用户提供的千问和高德官方说明安装，再按北京版 PRD 裁剪。本次不进行网页开发、批量翻译或部署。

当前阶段补充：用户明确高德部分先以“接口能用、能搜索到真实内容”为目标。下面的 PRD 适配属于已做的实现选择，不是当前验证的必要条件；后续产品开发再落实完整业务规则。

## 安装结果

安装位置为项目 `.agents/skills/`。保留现有其他技能，新增以下四项：

| 技能 | 项目用途 | 执行依赖 |
| --- | --- | --- |
| `qianwen-text` | 情况解析、微调、推荐解释和离线翻译的模型调用 | Python 3.9+ 标准库 |
| `qianwen-ops-auth` | 模型 Key、地域和 Base URL 配置与排错 | Python 或 Node，无独立 CLI |
| `qianwen-model-selector` | 文本模型选型、结构化输出与延迟权衡 | 官方文档；账户用量功能暂不接入 |
| `amap-lbs-skill` | 地点、周边厕所、步行和坐标转换联调 | Node.js 22+ 原生 fetch |

机器已具备 Node.js v26.8.1、npm 11.19.0、Python 3.9.6；未安装额外全局 CLI、npm 依赖或 Python 包。

千问来源：[用户指定安装说明](https://platform.qianwenai.com/skills.md)、[QianWen-AI/qianwen-ai](https://github.com/QianWen-AI/qianwen-ai)，固定提交 `7a7a6ddaa6320361776e4d10540147fa1abdd797`。通过 Codex skill-installer 的 GitHub 安装脚本选择三项目录，目标设置为本项目。

高德来源：[用户指定官方说明](https://developer.amap.com/api/skill/ready-to-use/summary)、[官方 LBS 压缩包](https://a.amap.com/jsapi/static/openClaw/amap-lbs-skill.zip)。每项技能保留 `UPSTREAM.md`；原始技能文档、来源和压缩包摘要保存在 `skill-sources/`。

## 裁剪范围

- 千问不安装图像/视频/语音生成、视觉理解、支付、账户用量、自动更新和上云部署技能。模型选择只保留项目文本任务分支。
- 文本调用保留官方 Python 执行器和共享库，移除自动更新钩子；默认模型由项目 `QWEN_MODEL` 明确指定，增加可配置超时，非流式请求不自动重试。
- 高德暂不安装 `amap-jsapi-skill`。保留 LBS，删除旅游编排、热力图、驾车/公交/骑行、遥测指令和 `config.json` 明文写 Key 的路径。
- 原高德包提供关键词搜索和 v3 步行算路。为后续开发，项目脚本补充独立的周边搜索、对齐 v5 分页参数，并改用 v5 步行；这些是实现选择，不能据此判定 v3 不可用。改用 Node 内置 fetch 只是为了减少依赖，Axios 本身不是问题。
- 所有裁剪仅作用于本次新增的四项技能。上游更新不能直接覆盖本项目修改。

## 是否需要 CLI

核心开发不需要千问 CLI、高德 CLI、OpenClaw 或 ClawHub。技能是给开发代理的指引与辅助脚本，生产网页仍由 Node 服务端调用 HTTP API。

千问官方完整模型选择/用量技能使用 `@qianwenai/qianwen-cli` 查询当前账户用量和账单，并要求独立的浏览器登录会话；模型 API Key 不能替代该会话。当前保留的文本调用不依赖此功能。

高德官方页给出 ClawHub 安装流程，也提供直接下载压缩包；本项目采用后者。官方原包需要 Node 和 Axios，项目裁剪版使用 Node 内置 fetch，因此无需另装 Axios。只有以后决定嵌入 JS 地图时才需要对应 JS Key 和安全配置。

## 配置

用户提供的两个 Key 已写入根目录 `.env`，权限为 0600；`.gitignore` 排除 `.env` 和其他本地环境文件，可提交的 `.env.example` 中凭据为空。

| 变量 | 状态 |
| --- | --- |
| `DASHSCOPE_API_KEY` | 已配置用户提供的千问 Key |
| `QWEN_REGION` | `cn-beijing` |
| `QWEN_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL` | `qwen3.8-flash`，基础 JSON 验证通过 |
| `AMAP_KEY` | 已配置用户提供的 Web 服务 Key |
| `BJDATA_KEY` | 留空，现有 CSV 导入不需要 |

千问上游兼容 `QIANWEN_API_KEY`，高德脚本兼容 `AMAP_WEBSERVICE_KEY`；本项目只保存表中主变量，避免重复凭据不同步。启动脚本需在项目根目录运行；高德 Node 命令使用 `--env-file=.env`。

## 基础验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 千问短 JSON 请求 | 成功，返回合法 `{"ok":true}`；38 输入 token、5 输出 token，共 43 token | `smoke/qianwen-summary.json` |
| 高德地点搜索 | 成功，找到真实“故宫博物院-神武门” | `smoke/amap-text-summary.json` |
| 高德周边搜索 | 成功，本页 10 条，实际含 `200300` 与 `200304`，产品仍需精确过滤母婴室 | `smoke/amap-capabilities-summary.json` |
| 高德步行 v5 | 成功，真实候选路线返回 `cost.duration` | 同上 |
| 高德坐标转换 | 成功，固定测试坐标返回转换结果；未使用用户位置 | 同上 |
| 本地检查 | 四项技能 frontmatter、Python 语法、Node 语法和两种脚本 help 通过 | 本轮执行记录 |

本次共一条模型请求、四条高德请求。仅验证基础连通和返回结构，不代表业务解析质量、覆盖完整性、账户剩余额度或持续延迟表现。请求与响应文件均不保存 Key。

随后按用户收窄后的目标补做两次搜索：关键词“南锣鼓巷”成功返回真实地点，再以其坐标查询周边公共厕所，本页返回 5 条，包括沙井胡同3号附近、沙井胡同13号旁及南锣鼓巷84号旁的厕所。证据见 `smoke/amap-basic-search-check.json`。当前基础可用性目标已达到。

## 剩余材料

1. 北京 CSV 对应的官方文件更新时间；原始标题中的 2022 年不能作为文件更新时间。
2. 离线批量翻译/后续测试的预算上限；账户配额暂未查询。
3. 手机联调和部署前确定部署平台/服务器与 HTTPS 地址。

当前 API 和技能已足以开始本地开发；以上材料按对应阶段补齐。
