# 数据处理与接口

实现数据导入、位置匹配、查询接口、地图接入或工程配置时，读取本文。返回 [PRD 总入口](README.md)。

## 输入与数据处理

直接使用仓库现有的[公厕 CSV](../../data/BJ-ToiletInfo.csv)。文件采用 GB18030、多行表头；先读取名称、区县、地址、坐标、设施和备注等字段。后续如提供同主体 XLSX，可作为替代输入，不重复导入成两套厕所。

一次性清洗生成应用可查询的数据即可。保留来源文件名、行号、原始字段与稳定内部 ID，输出导入数、可用位置数和跳过数，便于展示数据收集整理成果。

1. 跳过说明和表头行，按实际列映射字段，避免无障碍间、管理间、盥洗室等错位。
2. 空白及缺失符转为 `null`，数值 0 保留；布尔字段只映射自身含义，备注保留原文。
3. 解析十进制度和合法度分秒，检查有限值及经纬度范围。可按明确模式修正格式或经纬互换；无法使用的位置继续走地点匹配。
4. 相同高德 POI ID 和明确重复记录归并，保留来源行号。政府编号作为来源字段，不作为唯一数据库主键。
5. 按[设施线索规则](rules.md#需求与设施线索)生成初始状态，可加入 AI 分析和辅助翻译；保存分析依据方便展示。

已有数据即可推进开发；不等待补齐文件、逐条人工核对、全量资料治理或核验材料。字段缺失使用未知，后续可在相同结构上补充。

## 位置与资料匹配

高德提供地点搜索、厕所 POI 和步行路线，本地文件提供名称、地址及设施资料。正常流程先取可用本地候选，再补充高德信息；本地覆盖不足时可以直接展示高德候选。

匹配采用名称、地址、区县及已有坐标，规则或 AI 自动选择合理对应的记录。保存本地 ID、POI ID 和匹配方式即可；相似度模型、召回条数和阈值在实现时通过少量样例确定。多候选无法区分时使用独立高德记录，已有列表继续可用。

高德位置直接标记为 GCJ02；浏览器 GPS 坐标通过适配器转换一次。原表坐标系不清楚时优先使用地点匹配取得的位置，不让整份数据等待坐标系研究。设施字段与位置可以来自不同来源，在数据对象中保留来源名称。

有可用位置就可以展示地图和导航。缺少位置的记录仍保留文字信息，支持复制地址和手动地图搜索；进入步行推荐前需要获得可用路线。

## 最小数据模型

可使用本地 JSON、SQLite 或现有数据库，按查询需要选择，不要求建立多表证据平台。

| 对象 | 必需内容 |
| --- | --- |
| Toilet | `id`、中文名、地址、区县、位置、设施字段、坐便状态及依据、营业时间、进入条件、来源 |
| Source | 文件名/供应商、原始行号或 POI ID、必要的原始字段 |
| Place | `provider`、`poiId`（手选点可空）、中文名、地址、区县、位置、起点类型 |
| Route | 起终点、`status`、`walkSeconds`、`walkMeters`；失败时数字为 `null` |
| PlanLocal | `schemaVersion`、语言、需求、进入设置、站点、选择、跳过项和更新时间 |

位置对象包含 `lng`、`lat`、`crs`，查询接口内部使用 GCJ02。`routeStatus` 为 `success`、`unreachable`、`provider_error` 或 `pending`。设施推断、原始记录与用户选择分别保存，避免相互覆盖。

## 接口约定

业务接口前缀 `/api/v1`，使用 JSON。语言为 `en` / `zh-CN`；需求、状态和分组采用[规则细则](rules.md)的名称。

| 接口 | 关键输入 | 输出 |
| --- | --- | --- |
| `GET /places/search` | `q`、`language`、`city=beijing` | `places`、`hasMore` |
| `POST /assist/parse` | `text`、`mode`、`language`、当前需求 | [行程解析结构](ai.md#行程解析) |
| `POST /toilets/search` | 起点、上下文、需求、步行限制、进入设置、范围、分页游标 | 状态、分组候选、AI 说明、下一页、查询版本 |
| `GET /toilets/:id` | `language` | 详情、来源字段与分析说明 |
| `POST /plans/preview` | 站点、全局需求与范围、`revision` | 各站 `status`、`primary`、`alternatives`，整体状态 |
| `POST /navigation/link` | `toiletId`、`origin` | `appUrl`、`webUrl`、目的地及复制信息 |

`mode=itinerary` 为首版必需；`nearby` 仅在扩展即时自然语言时启用。地点搜索默认最多返回 10 个候选，结果可由用户继续搜索。

成功响应为 `requestId`、`data`、`warnings`；失败响应为 `requestId`、`error.code`、`error.message` 和 `error.retryable`。部分成功使用正常响应，`data.status=partial`。搜索无候选属于正常结果，服务故障单独表示。

### 搜索请求

```json
{
  "origin": {"lng": 116.40, "lat": 39.91, "crs": "GCJ02", "label": "所选起点", "source": "manual"},
  "context": "nearby",
  "preference": "seated_required",
  "walkLimitMinutes": 10,
  "includeConditionalAccess": false,
  "extendedRadiusKm": 5,
  "language": "en",
  "queryVersion": 3,
  "cursor": null
}
```

此坐标仅演示格式。`context` 为 `nearby` / `plan_stop`，用于选择即时或规划规则。`walkLimitMinutes` 为 10 / 20，`extendedRadiusKm` 为 5 / 10；`any` 不使用坐便扩展范围。

### 搜索响应

```json
{
  "requestId": "req_example",
  "data": {
    "status": "empty",
    "queryVersion": 3,
    "groups": {"matched": [], "farther": [], "otherNearby": [], "conditionalAccess": [], "routeUnknown": []},
    "analysisStatus": "complete",
    "summary": "当前范围没有候选，请扩大范围或更换起点。",
    "hasMore": false,
    "nextCursor": null
  },
  "warnings": []
}
```

候选至少包含 `toiletId`、`nameZh`、`nameEn`、`addressZh`、`position`、`seatStatus`、`seatBasis`、`facilities`、`openingStatus`、`openingHoursRaw`、`accessCondition`、`routeStatus`、`walkSeconds`、`walkMeters`、`straightLineMeters`、`reason`、`sources`。缺失字段为 `null` 或对应 `unknown` 状态。

查询状态 `complete` 表示本次处理完成且有候选，`empty` 表示处理完成且没有候选，`partial` 表示部分信息尚未取得或服务部分失败。候选是否适合需求由分组表达。`analysisStatus` 为 `pending` / `complete` / `fallback`，便于先返回候选后补充 AI 分析。

游标绑定当前查询条件；条件变化时重新查询。`conditionalAccess` 保留 `baseGroup`，每个厕所仅进入一个展示组。路线未知、普通未知设施的展开方式见[分组规则](rules.md#分组与排序)。

### 规划与错误处理

每站使用稳定 `stopId`、顺序和地点，响应按 `stopId` 关联。`revision` 随编辑改变，过期响应不覆盖新行程；某站失败时其余站继续展示，支持单站重试。服务器计算预览，本机保存用户行程。

输入错误返回 400，北京外起点或未选定地点返回 422；供应商/AI 暂不可用返回可重试错误或部分结果；不存在的详情返回 404。没有坐标可用于导航时提供复制地址，不构造错误导航链接。开发时沿用现有 HTTP 框架统一错误码即可。

## 工程配置

以下为初值，集中配置，通过 Demo 联调调整；产品范围与步行语义以[推荐规则](rules.md#范围)为准。

| 参数 | 初值 |
| --- | --- |
| 普通召回半径 | 2/3 公里，对应 10/20 分钟选择 |
| 坐便扩展召回 | 5/10 公里 |
| 站点上限、单站初始卡片 | 10 站、3 张 |
| AI 输入长度 | 2,000 字符 |
| 定位、外部服务、AI 超时 | 8 秒、5 秒、12 秒 |
| 路线缓存 | 15 分钟 |
| 分批算路 | 每批 10 个，每起点每次最多 60 个，并发初值 5 |

分批召回兼顾普通候选和有设施线索的候选，未处理完返回 `hasMore`。缓存键包含起点、终点、坐标系和步行模式，避免不同景点复用错误路线。

前端可沿用 React + TypeScript + Vite，服务端采用现有 Node.js 方案。地图和 AI 调用设置超时，等待较长时显示进度和重试；无需为演示先搭建分布式调度或高并发平台。

服务端保存地图 Web 服务和模型凭据，网页地图使用对应前端配置。输入按文本渲染，日志记录请求 ID、耗时和错误，不写密钥、完整行程和精确位置。

## 地图接入与参考

沿用[高德联调技能](../../.agents/skills/amap-lbs-skill/SKILL.md)及现有调用脚本；产品查询显式传范围参数，不直接采用脚本默认半径。读取实际 POI 分类、位置和路线返回，缺失的附加属性保持未知。

需要实现对应接入时读取官方资料：

- [POI 搜索](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)与[分类表](https://lbs.amap.com/api/webservice/download)
- [步行路线](https://lbs.amap.com/api/webservice/guide/api/newroute)与[坐标转换](https://lbs.amap.com/api/webservice/guide/api/convert)
- [导航 URI](https://lbs.amap.com/api/uri-api/guide/travel/route)
- [网页地图加载](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load)与[安全配置](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)

已有联调情况见 [API 准备记录](../../.scratch/api-readiness/spec.md)。这些资料支持接入，不增加现场核验与数据时效审计任务。
