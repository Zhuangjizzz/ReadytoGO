# 高德 API 返回语言支持核对

核对日期：2026-10-09（Asia/Shanghai）。范围：ReadytoGo 使用的 Web 服务接口，并补充 JS API 地图语言作为对照。本次只做文档调查和只读接口验证，不调整实现。

## 结论

高德 POI 搜索可以指定返回语言。官方当前高级文档为 v5 文本、周边搜索列出 `langCode`：默认 `zh`（中文），可选 `en`（英文）；POI 多语言搜索属于高级服务，需要通过工单商务咨询。该结论不能外推为日语、韩语等任意语言均可返回。[官方搜索 POI 2.0 文档，更新于 2026-07-15](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)

**当前项目 Key 尚不能调用英文 POI 搜索。** 同一查询的 v3/v5 文本搜索，不传 `langCode` 均成功且返回中文名称和地址；加入 `langCode=en` 后均返回 `10012 / INSUFFICIENT_PRIVILEGES`。因此可以确认当前英文请求被权限拒绝；结合官方高级服务说明，下一步是确认并开通对应多语言权限。[本次只读对照结果](./probe.json)

## 接口支持表

| 接口/能力 | 文档可确认的返回语言支持 | 依据与边界 |
| --- | --- | --- |
| `/v5/place/text` | `langCode=zh/en`，默认 `zh` | 高级服务；当前 Key 的 `en` 请求权限不足。[官方](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch) / [实测](./probe.json) |
| `/v5/place/around` | `langCode=zh/en`，默认 `zh` | 官方周边搜索参数明确列出；本次未单独实测周边端点。[官方](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch) |
| `/v3/place/text`、`/v3/place/around` | `langCode=zh/en`，默认 `zh` | 旧版同样列入高级服务；本次只验证了文本搜索。[官方](https://lbs.amap.com/api/webservice/guide/api-advanced/search) / [实测](./probe.json) |
| `/v5/direction/walking` | 公开参数表未列返回语言参数 | 返回包含 `instruction`、`orientation`、`road_name`；没有公开证据可承诺这些字段能切换英文。不能把文档未列参数等同于平台绝无相关商业能力。[官方](https://lbs.amap.com/api/webservice/guide/api/newroute) |
| `/v3/geocode/regeo` | 公开参数表未列返回语言参数 | 返回地址、道路、POI 等信息，但本页没有语言选择契约。[官方](https://lbs.amap.com/api/webservice/guide/api/georegeo) |
| `/v3/staticmap` | 公开参数表未列底图语言参数 | 返回地图图片；`labels` 可传自定义文字，不代表底图道路/地名随之翻译。不能直接套用 JS API 的语言配置。[官方](https://lbs.amap.com/api/webservice/guide/api/staticmaps) |
| `/v3/assistant/coordinate/convert` | 无业务文字语言选择需求 | 主要输出转换后的坐标；公开参数无语言项。[官方](https://lbs.amap.com/api/webservice/guide/api/convert) |

## 当前 Key 对照验证

时间：2026-10-09 11:54（Asia/Shanghai）。查询：`故宫博物院`。四次请求均 HTTP 200，因此须检查 JSON 内 `status/infocode`，不能以 HTTP 状态判断成功。[原始脱敏记录](./probe.json)

| 接口 | `langCode` | 业务结果 |
| --- | --- | --- |
| `/v5/place/text` | 不传 | `status=1 / 10000 / OK`；`故宫博物院`、`景山前街4号` |
| `/v5/place/text` | `en` | `status=0 / 10012 / INSUFFICIENT_PRIVILEGES` |
| `/v3/place/text` | 不传 | `status=1 / 10000 / OK`；`故宫博物院`、`景山前街4号` |
| `/v3/place/text` | `en` | `status=0 / 10012 / INSUFFICIENT_PRIVILEGES` |

这组对照证明当前 Key 的默认搜索正常、英文调用权限不足；没有取得授权后的英文成功样本，不能据此确认英文覆盖率或每个字段的翻译质量。[原始脱敏记录](./probe.json)

## 地图语言与数据语言需分别处理

JS API 2.0 当前多语言教程使用 `languageCode`，并要求 Key 开通多语言地图权限。参数列表包含 `zh`、`en`、`zh-Hant`、`es`、`pt`、`fr`、`de`、`th`、`ja`、`ko`、`ar`、`tr`、`it`、`ru`、`ms`、`id`、`vi`。正文的语言数量与参数枚举不一致，因此采用具体枚举，不使用正文数量作保证。上述能力控制地图图面，不能据此推断 POI REST 返回也支持这些语言。[官方多语言地图教程，更新于 2026-07-14](https://lbs.amap.com/api/javascript-api-v2/guide/map/englishmap)

旧示例仍可见 `lang=zh_cn/en/zh_en`；它属于 JS 地图接口语境，不能作为 REST POI 请求参数。新接入应按当前教程与实际加载版本核对 `languageCode`，而不是混用 `lang`、`languageCode`、`langCode`。[旧 JS 1.4 官方示例](https://lbs.amap.com/demo/javascript-api/example/map/map-english) / [当前教程](https://lbs.amap.com/api/javascript-api-v2/guide/map/englishmap)

`output` 表示序列化格式，与中文/英文无关：v5 POI 和 v5 步行的具体参数表仅列 JSON，逆地理编码与坐标转换列 JSON/XML；UTF-8 则表示字符编码。部分页面的通用介绍仍泛称 JSON/XML，应以对应端点参数表为准。[POI](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch) / [步行](https://lbs.amap.com/api/webservice/guide/api/newroute) / [逆地理编码](https://lbs.amap.com/api/webservice/guide/api/georegeo) / [坐标转换](https://lbs.amap.com/api/webservice/guide/api/convert)

## 尚需核实

- 开通 POI 多语言权限的费用、账号或 Key 授权范围，以高德工单答复为准；公开参数表只指向商务咨询。[官方](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)
- 授权后，`name/address/type/行政区名称/营业时间` 等哪些字段会被翻译、缺译时如何回退，当前公开参数表未承诺；应以相同 POI ID 做中英对照验证。[官方返回字段说明](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)
- 步行指引、逆地理编码、静态地图是否另有可申请的多语言服务，需要端点对应的官方确认；现有公开文档不足以作支持承诺。[步行](https://lbs.amap.com/api/webservice/guide/api/newroute) / [逆地理编码](https://lbs.amap.com/api/webservice/guide/api/georegeo) / [静态地图](https://lbs.amap.com/api/webservice/guide/api/staticmaps)

检索时须注意：搜索引擎仍收录旧基础路径 `/guide/api/newpoisearch`、`/guide/api/search/`，而官网当前导航指向 `/guide/api-advanced/newpoisearch`、`/guide/api-advanced/search`。不能依据旧页面缺少 `langCode` 得出不支持语言的结论。[当前 POI 2.0 文档与导航](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)
