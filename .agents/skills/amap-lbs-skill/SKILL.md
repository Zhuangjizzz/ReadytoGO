---
name: amap-lbs-skill
description: 使用高德 Web 服务为 ReadytoGo 搜索真实起点与周边厕所、验证步行耗时和转换坐标。
compatibility: Node.js 22+；使用内置 fetch，读取项目 .env 的 AMAP_KEY，无 npm 依赖或额外 CLI。
---

# ReadytoGo 高德 LBS

基于高德官方分发的 amap-lbs-skill 裁剪。来源和本项目改动见 UPSTREAM.md。

当前准备阶段按用户要求，只验证 Key 可用、关键词和周边搜索能返回真实地点。下方的 PRD 口径在后续开发产品时应用，不作为基础搜索的前置条件。

## 配置与运行

从项目根目录运行 `node --env-file=.env <本技能绝对路径>/scripts/query.mjs --help`。

- `AMAP_KEY`：用户的 Web 服务 Key；兼容 `AMAP_WEBSERVICE_KEY`。值只存在服务端环境/被忽略的 `.env`。
- 不需要 JS Key、securityJsCode、OpenClaw、ClawHub CLI 或高德 CLI。
- 只读查询命令为 `query.mjs <操作> '<JSON参数>'`。先看 help，再使用下面对应操作；stdout 是含操作、取数时间和高德原始数据的 JSON。

| 操作 | 用途 | API/默认关键字段 |
| --- | --- | --- |
| `text` | 手选起点 | `/v5/place/text`；默认北京，`page_size` / `page_num` |
| `around` | 周边厕所 | `/v5/place/around`；默认类型 `200300|200303`、`show_fields=business,indoor`、半径 1000 米 |
| `walking` | 卡片步行信息 | `/v5/direction/walking`；固定 `show_fields=cost`，读取 `route.paths[].cost.duration` 秒 |
| `convert` | 坐标转换 | `/v3/assistant/coordinate/convert`；必须显式给出源 `coordsys` 和 `locations` |

示例参数：`text '{"keywords":"故宫神武门","page_size":3}'`。周边搜索使用刚返回的真实 POI 坐标；经度在前、纬度在后。地图链接是展示入口，不能替代结构化结果或步行算路。

## 验证与口径

- 请求失败返回非零退出码与简短错误码；不输出带 Key 的 URL。脚本单次超时 10 秒，不自动重试。
- 高德 `status=1` 后仍需检查 POI 和路线是否存在。`count` 不用作完整覆盖的证明，按当前官方分页规则和实际页返回继续处理。
- 按实际返回 `typecode` 精确过滤，排除母婴室；名称包含“无障碍”不能提升坐便证据。
- 步行分钟只来自算路耗时；失败回退地图距离，禁止自行按步速换算。
- 政府坐标先确认坐标系，保留原始坐标；高德坐标不能重复转换。脚本不猜测源坐标系。
- 本技能用于开发联调。政府公厕 JSON、合并去重、分区排序和数据降级由产品服务端实现。
- 不把营业字段称为实时开放，不把无障碍设施当作路线无障碍保证。

## 官方来源

- [POI 2.0](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)
- [路径规划 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)
- [坐标转换](https://lbs.amap.com/api/webservice/guide/api/convert)
- [网页导航 URI](https://lbs.amap.com/api/uri-api/guide/travel/route)：`mode=walk&callnative=0`，无需 Key。

仅在后续决定嵌入交互地图时再安装 JS API skill 并申请对应 Key。
