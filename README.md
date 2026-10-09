# ReadytoGo

北京入境游客如厕助手 Demo。使用现有北京公厕资料、高德地点和真实步行路线，以及千问行程解析与候选分析，提供中英双语的附近搜索、逐站规划、地图、详情、导航和本机保存。默认英文，中文名称与地址始终保留。

公网演示：[ReadytoGo](https://47.85.138.198/)。公网 IP HTTPS、证书和自动续期见 [HTTPS 发布记录](docs/delivery/ip-https.md)。具体运行版本、验证范围和回滚见[发布记录](docs/delivery/deployment-record.md)。最终独立双轴工程复核已完成，120项测试通过；实际手机验收限制仍见[交付验收](docs/delivery/acceptance.md)。

## 本地运行

需要 Node.js >=22.12（部署验证版本为 24.15.0）和 npm。先复制配置示例，在本机填写已有供应商凭据：

```bash
cp .env.example .env
npm ci
npm run dev
```

开发网页在 `http://localhost:5173`，API 在 `http://localhost:3001`，Vite 代理 `/api` 和 `/health`。服务首次启动会把 `data/BJ-ToiletInfo.csv` 导入为 `data/generated/catalog.json`。手动重新导入可运行 `npm run import:data`；原 CSV 不被修改。

| 服务端配置          | 用途                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `AMAP_KEY`          | 高德 Web 服务 key，用于地点、路线、坐标转换、行政区检查和静态地图；兼容 `AMAP_WEBSERVICE_KEY`    |
| `DASHSCOPE_API_KEY` | 现有千问服务凭据                                                                                 |
| `QWEN_BASE_URL`     | 与凭据地域对应的 OpenAI 兼容调用地址，示例为 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL`        | 当前有访问权限的模型；示例配置已用于本次有界验证，不代表通用可用性保证                           |
| `HOST` / `PORT`     | 默认 `0.0.0.0` / `3001`；回环预发布用 `127.0.0.1`                                                |
| `CATALOG_PATH`      | 正式导入文件，默认 `data/generated/catalog.json`                                                 |
| `MATCH_CACHE_PATH`  | 可选关联缓存，默认 `data/generated/matches.json`；空字符串禁用磁盘缓存                           |

配置只由服务器读取；真实 `.env` 不进 Git。浏览器不接收模型或地图 key。`QWEN_REGION` 是配置地域提示，`BJDATA_KEY` 仅用于另行下载资料，当前应用运行不使用这两项。没有持久 AI 缓存配置。

没有模型配置时仍能手动搜索、规划并使用规则说明；没有高德配置时仍能导入/检查本地资料和运行离线测试，真实地点、路线及地图需要有效的 Web 服务 key。本项目通过原生 `openai` npm 包调用千问兼容接口，不需要另建 OpenAI API key。

## 构建与检查

```bash
npm test
npm run check
npm run build
npm start
```

单进程生产网页默认在 `http://localhost:3001`，`GET /health` 返回 `service=readytogo`。构建产物包括 `dist/client` 与 `dist/server/main.js`；服务器仍依赖生产 npm 包。Linux 发布必须用锁文件执行 `npm ci --omit=dev`，保留原 CSV，不能上传 macOS node_modules。生产缺少导入文件时会自动导入，不需要安装 tsx 或运行开发导入脚本。

`npm test` 包含公开 HTTP、正式 CSV 导入、真实启动进程和隔离 JSDOM 组件测试。`npm run test:wayfinding` 是独立的离线浏览器 fixture 检查，不等于实际应用端到端验收。真实供应商验证是有界人工触发，证据见 [交付验收](docs/delivery/acceptance.md)，不会被默认测试循环反复调用。

## 四步演示

1. 展示 [数据处理记录](docs/data-processing.md) 和 `/api/v1/data/summary`：13,156 条源记录导入为 13,124 个实体，合并 32 条重复记录；零与未知分开。原始坐标系未知，不直接用于路线。
2. 在首页选择附近搜索，搜索任意北京起点。比较无特殊要求与需要坐便、10/20 分钟、进入条件和更远范围，查看列表/地图及真实路线。设施推断保留来源与不确定性。
3. 在规划中输入一段中英行程，核对 AI 解析和地图地点。确认前可改词、删增、重排、保留重复地点；确认后逐站预览、替换或跳过。也可完全手动添加 1–10 站。
4. 打开详情和导航，展示高德 App/网页入口、复制中文地址及五句双语询问卡；切换语言、刷新恢复本机当前行程，最后清除。

演示输入可自由变化。记录样例仅用于文档和测试，不作为生产景点词典或条件分支。

## 异常与已知限制

- 公网 IP HTTPS 已启用，使用定位请打开上方 HTTPS 地址。原 HTTP 入口仍有定位限制；用户拒绝、定位超时或设备无法取得位置时，使用地点搜索或地图手选。真实手机定位仍待验收，域名仍暂缓。
- 模型超时/输出无效时保留文本、可编辑草稿与旧计划；候选说明回退为规则解释。模型不会生成坐标或替代真实路线。
- 地图或部分路线失败时保留已有列表、单项重试、网页导航和复制地址；当前范围无结果与服务错误分开。
- 本机存储不可用时继续当前会话；损坏或未知版本有恢复提示。只保存一份当前计划，浏览器 GPS 仅属会话状态。
- 首次交付的应用浏览器检查曾受工具权限限制。2026-10-09 已补验线上地图选点、缩放平移与确认起点，见[专项记录](docs/delivery/map-picker-verification.md)；同时保留图片503及上游连接间歇失败的观测。实际手机主线及其余完整应用检查仍待完成，不能把390×844触屏模拟标作真机通过。
- 数据未逐点现场核验；开放、进入条件和设施以已有来源为依据。高德/模型配额、网络延迟和来源缺项可能影响结果。

## 文档入口

- [产品需求](docs/prd/README.md)、[原始验收条件](docs/prd/acceptance.md)、[当前交付与限制](docs/delivery/acceptance.md)。
- [数据处理](docs/data-processing.md)、[附近查询](docs/query-behavior.md)、[地图导航](docs/implementation/wayfinding.md)、[逐站规划](docs/implementation/planning.md)、[AI输入与确认](docs/implementation/ai-itinerary.md)、[真实AI证据](docs/delivery/ai-evidence.md)。
- [发布、回滚与运行排查](docs/deployment/deployment.md)、[实际发布记录](docs/delivery/deployment-record.md)。
- [Agent开发指南](docs/agent-sdk/agent-development.md)、[设计约定](DESIGN.md#readytogo-使用约定)、[协作约定](AGENTS.md)。
