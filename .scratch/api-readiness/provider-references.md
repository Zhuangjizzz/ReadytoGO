# ReadytoGo 供应商 API 前置核对

核对日期：2026-10-08（Asia/Shanghai）。范围依据 `docs/ReadytoGo-PRD-v2.0-Beijing.md` 第 4、6、7、12 节。初次规划为公开文档核对；用户随后交付 Key，已完成短模型请求及四类高德请求，详情见 [技能与配置记录](skill-setup.md)。剩余额度与完整数据覆盖率尚未实测。

## 高德：一把 Web 服务 Key 覆盖四类接口

| PRD 能力 | 官方接口与关键参数 | 交付要求 |
| --- | --- | --- |
| 手选起点的真实地点搜索 | `GET /v5/place/text` | Web 服务 API 类型 Key |
| 周边厕所补充 | `GET /v5/place/around`；`show_fields=business,indoor` | 同一 Web 服务 Key；确认 POI 搜索 2.0 可用及当前配额 |
| 卡片步行耗时 | `GET /v5/direction/walking`；`show_fields=cost` | 同一 Web 服务 Key；读取方案的 `cost.duration`（秒） |
| 浏览器或 CSV 坐标转换 | `GET /v3/assistant/coordinate/convert`；`coordsys=gps` 或 `baidu` | 同一 Web 服务 Key；先确认原始坐标系，避免重复转换 |

POI 2.0 的 `business` 包含营业时间描述；`indoor` 包含室内地图标志及楼层字段，`indoor_map=0` 时不返回楼层。请求扩展字段不代表每个厕所都会有值，仍需按 PRD 做北京三站真实请求验证。步行 2.0 默认只返回基础字段，耗时在 `cost` 可选组内，故实现时必须显式请求。坐标转换每次最多 40 对，输入为经度在前、纬度在后。[高德 POI 2.0](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch)、[路径规划 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)、[坐标转换](https://lbs.amap.com/api/webservice/guide/api/convert)。

网页导航使用 URI 路线参数 `mode=walk&callnative=0`，官方明确 URI API 无需申请 Key。若后续加入页面内交互地图或高德 JS 定位，再准备单独的 Web 端（JS API）Key 与配套安全密钥（`securityJsCode`）；它们与后端 Web 服务 Key 是不同接入类型。当前 PRD 的浏览器定位、结果卡和外跳导航不构成必须引入 JS SDK 的理由。[路线 URI](https://lbs.amap.com/api/uri-api/guide/travel/route)、[URI 是否需要 Key](https://lbs.amap.com/faq/js-api/url-js-api/create-project/46361)、[JS API 准备](https://lbs.amap.com/api/javascript-api-v2/prerequisites)、[JS 安全密钥](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)。

## 阿里百炼：Key 之外需配套调用信息

需要交付：可用于本项目后端的 API Key、地域、API Host 或完整 Base URL、准确的模型 ID、已授权模型范围、当前 RPM/TPM 或其他调用限制，以及本项目可用预算。Key 可限定 IP 与模型范围；各地域的 Key、接入点和模型列表不能混用，因此仅有 Key 不足以确定正确调用。按量模型调用的北京兼容地址仍支持 `https://dashscope.aliyuncs.com/compatible-mode/v1`；官方同时推荐业务空间专属地址 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`，应以用户账号提供的 API Host 为准。Coding Plan / Token Plan 专属 Key 不适用于本项目后端服务。[获取与配置 Key](https://help.aliyun.com/zh/model-studio/get-api-key)、[Base URL 总览](https://help.aliyun.com/zh/model-studio/base-url)、[地域与接入域名](https://help.aliyun.com/zh/model-studio/regions/)。

情况解析和推荐理由都需要结构化 JSON。官方支持 `json_object` 和部分模型的严格 `json_schema`；前者仅保证 JSON 语法，不保证字段结构。部分模型仅在非思考模式支持稳定结构化输出。选定具体模型后再核对模式并测试，始终保留 PRD 的枚举、候选 ID、理由证据、数字和禁用表述校验。无需用户另开翻译 API：PRD 的离线英日韩名称增强可复用同一模型服务。[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)；应用内职责与复用范围依据 PRD 第 4、6.3 节。

用户说的 skill 需提供文件或文档及使用方式。若只是开发接入指南或提示词，模型 API 即可；若指已搭建的百炼智能体/工作流，则另需该应用的 `APP_ID`、应用调用文档与输入输出样例。官方应用调用使用 `api_key + app_id`，与直调模型的 `model` 参数不是同一契约，不可凭 skill 名称推断。[智能体应用调用](https://help.aliyun.com/zh/model-studio/call-single-agent-application)。

## 待接入时确认

- 高德：四类接口的实际权限、日配额/并发限制、服务器 IP 限制、北京楼层与营业字段有值比例；真机网页导航可达性。
- 百炼：Key 与 Host/模型的匹配、模型访问权限与余额、短超时下的结构化输出稳定性、多语言偏好解析质量；若接应用，验证准确的应用契约。
- 以上是后续联调验收项，不要求用户先编写 ReadytoGo 自身的 `/api/*`；这些业务接口由开发实现。
