---
name: amap-lbs-skill
description: 使用高德 Web 服务为 ReadytoGo 搜索真实起点与周边厕所、验证步行耗时和转换坐标。
compatibility: Node.js 22+；使用内置 fetch，读取项目 .env 的 AMAP_KEY，无 npm 依赖或额外 CLI。
---

# ReadytoGo 高德 LBS

基于高德官方分发的 amap-lbs-skill 裁剪。来源和本项目改动见 UPSTREAM.md。

脚本用于 Web 服务联调；产品地图、范围、数据匹配及回退按 [Demo 数据细则](../../../docs/prd/data-and-api.md)执行。

## 配置与运行

从项目根目录运行 `node --env-file=.env <本技能绝对路径>/scripts/query.mjs --help`。

- `AMAP_KEY`：用户的 Web 服务 Key；兼容 `AMAP_WEBSERVICE_KEY`。值只存在服务端环境/被忽略的 `.env`。
- 此 Web 服务脚本使用上述配置即可；产品嵌入地图另按 JS API 的接入要求配置。
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
- 使用实际返回类型筛选厕所；设施解释和 AI 推断按 [推荐规则](../../../docs/prd/rules.md)。
- 步行分钟只来自算路耗时；失败回退地图距离，禁止自行按步速换算。
- 优先使用高德返回的位置；调用转换时显式传源坐标系，高德位置不重复转换。原表位置问题可通过产品自动匹配处理。
- 本技能用于开发联调。政府公厕 JSON、合并去重、分区排序和数据降级由产品服务端实现。
- 不把营业字段称为实时开放，不把无障碍设施当作路线无障碍保证。

## 官方来源

- [POI 2.0](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)
- [路径规划 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)
- [坐标转换](https://lbs.amap.com/api/webservice/guide/api/convert)
- [网页导航 URI](https://lbs.amap.com/api/uri-api/guide/travel/route)：`mode=walk&callnative=0`，无需 Key。

Demo 包含嵌入地图；实现时配置对应 JS API Key，加载失败保留列表和导航链接。当前脚本不承担地图 UI。
