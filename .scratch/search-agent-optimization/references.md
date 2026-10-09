# 地点搜索与 Agent 优化：官方能力核对

核对日期：2026-10-09。范围：公开官方文档与官方示例；本轮未安装框架、读取凭据或调用在线模型。以下“建议”是针对 ReadytoGo 的设计推导，不代表已实现或已实测。当前代码梳理及最终方案见同目录分析文档。

## 1. 原生 SDK 与 Agent 框架

- 千问官方 Function Calling 示例使用 OpenAI SDK：模型返回工具调用，应用执行函数，把 assistant 的完整 `tool_calls` 和每项匹配 `tool_call_id` 的 `role: tool` 结果写回消息，再请求模型。循环与工具执行需要应用或框架承担，基础 SDK 不会因为声明工具就自动执行地点搜索或数据库查询。来源：[千问 Function Calling](https://help.aliyun.com/zh/model-studio/qwen-function-calling)。核对：2026-10-09。
- OpenAI Agents SDK 在应用中运行 Agent 循环并调用应用提供的工具；服务端继续拥有工具实现、存储与运行策略。它与 OpenAI 托管的 Agents API 是不同层次。来源：[Agents SDK 概览](https://developers.openai.com/api/docs/guides/agents/sdk)。核对：2026-10-09。
- 官方 TypeScript 示例通过自定义 `OpenAI` 客户端的 `baseURL` 和 API key，构建 `OpenAIChatCompletionsModel`，再交给 `Runner`。这提供保留千问服务商、采用 Agents SDK 编排的接入路径；示例不构成对 ReadytoGo 所选模型的兼容性测试。来源：[官方自定义 Provider 示例](https://github.com/openai/openai-agents-js/blob/main/examples/model-providers/custom-example-provider.ts)。核对：2026-10-09。
- SDK 默认 provider 使用 Responses；兼容 Chat Completions 的服务必须显式选择该路径，例如具体的 `OpenAIChatCompletionsModel` 或 provider 的 `useResponses: false`。Responses 专有功能不能从“OpenAI 兼容”推定可用。当前官方模型页说明可传入 `openai` 7.2+ 客户端，并通过 `providerData` 传递厂商参数。来源：[Models](https://openai.github.io/openai-agents-js/guides/models/)。核对：2026-10-09。

建议：以一个搜索 Agent 和一组领域工具起步。原生 `openai` 客户端继续承担请求传输，框架负责多轮运行；保留既有短 JSON 调用接口用于一次匹配验证，增加独立的工具调用适配层。不要把原来“只返回字符串、只接受 `finish_reason=stop`”的接口直接当作工具调用运行时。框架版本、厂商参数透传、工具 schema、消息历史与多轮返回需在实现阶段做最小兼容性验证并锁定版本。

## 2. 千问工具调用与结构化验证的边界

- 官方当前说明：Qwen 的 `tool_choice: "required"` 在非思考模式下不能保证一定调用工具，在思考模式下不支持；强制具体工具另有设置。`parallel_tool_calls` 用于独立调用，依赖上一步结果的调用仍需多轮。来源：[千问 Function Calling：工具选择与并行调用](https://help.aliyun.com/zh/model-studio/qwen-function-calling)。核对：2026-10-09。
- `json_object` 保证 JSON 形式，不保证业务 schema；`json_schema` 的严格约束仅由部分模型支持。格式正确也不能代替对候选 ID、事实、同一实体关系的业务校验。来源：[千问结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。最后一句是工程推导。核对：2026-10-09。
- Agents SDK 支持多步运行、状态与轮数限制；具体工具预算、总耗时、重复调用去重和业务完成条件仍需产品自己定义。来源：[Running Agents](https://openai.github.io/openai-agents-js/guides/running-agents/)。后半句是本项目运行策略建议。核对：2026-10-09。

建议分清两种模型预算：

1. **数据库实体匹配**：代码执行相似度召回；一次模型请求批量验证本批地图 POI 与本地记录的候选对。允许 `match`、`no_match`、`ambiguous`；只接受召回过的 ID，拒绝凭空补记录。
2. **搜索 Agent**：为完成意图可以经历多个模型回合，例如定位、地点搜索、数据库匹配、路线计算和最终说明。工具内部的一次匹配验证不会让整个 Agent 变成“一次模型调用”。同批候选缓存验证结果，Agent 反复读取不得重复触发验证。

建议用服务端状态保证必需步骤和事实来源，不以 `tool_choice=required` 保证完成。终止依据应包括有效位置、真实候选及可追溯的匹配/路线结果；达到预算时返回现有有效结果和明确缺项。

## 3. “当前位置”需要浏览器与服务端协作

- W3C Geolocation 明确要求用户授权；非安全上下文会返回 `PERMISSION_DENIED`，定位还可能返回 `POSITION_UNAVAILABLE` 或 `TIMEOUT`。位置来自承载网页的设备能力。来源：[W3C Geolocation](https://www.w3.org/TR/geolocation/)。核对：2026-10-09。
- 浏览器地理坐标使用 WGS84，`accuracy` 是米制精度半径。高德国内 JS API 文档说明其坐标为 GCJ-02，并提供 GPS 到高德坐标转换；Web 服务转换接口提供 `coordsys=gps`。来源：[W3C 坐标定义](https://www.w3.org/TR/geolocation/#coordinates_interface)、[高德坐标说明](https://lbs.amap.com/api/javascript-api-v2/guide/transform/convertfrom)、[高德 Web 坐标转换](https://developer.amap.com/api/webservice/guide/api/convert)。核对：2026-10-09。

建议把 `get_current_location` 设计成前端能力桥：已有授权且位置足够新时返回缓存位置；否则服务端进入 `awaiting_location`，前端发起浏览器定位，将坐标、坐标系、采集时间和精度回传后续跑。需要用户授权时呈现系统授权请求，拒绝或超时则转为手动选择地点。服务端 LLM 不能自行得知设备位置，也不能用猜测坐标补全工具结果；这是根据上述能力边界得出的实现要求。只有已确认坐标系的点才能进入距离匹配与高德搜索。

## 4. SQLite 相似度召回的中文边界

- FTS5 默认 `unicode61` 将连续 token 字符作为一个 token，并不提供中文词语分词规则；`trigram` 按连续三个字符切片，支持子串检索；FTS5 也支持自定义 tokenizer。来源：[SQLite FTS5 tokenizers](https://www.sqlite.org/fts5.html#tokenizers)。核对：2026-10-09。
- 原生 trigram 全文查询不会命中少于三个 Unicode 字符的子串。因此“厕所”“公厕”等两字词不能只走 trigram MATCH；LIKE/GLOB 在缺少可用字面片段时可能退化为全表扫描。来源：[SQLite FTS5 trigram](https://www.sqlite.org/fts5.html#the_trigram_tokenizer)。核对：2026-10-09。

建议先把“找相似记录”和“判断是不是同一个厕所”分开：

- 小规模数据可使用应用层标准化、中文字符 bigram、英文 token、名称/别名/地址相似度形成可解释的 Top-K；这是一种低依赖实现方案，不是 SQLite 自带的语义能力。
- 将所属设施、地址细节、楼层/入口、城区及可用坐标距离分别作为匹配证据。仅在两侧坐标有效且已统一坐标系时使用距离；缺字段保持未知。设施类型相同不等于同一实体，不宜只靠向量相似度合并。
- 数据增大后，可用预分词 FTS5 或 trigram 加短词回退做粗召回，再用同一个实体匹配器复排。是否增加向量召回，应由中英别名、拼写差异与召回漏例的评估结果决定。
- 将召回 Top-K 的正确记录覆盖率、验证误合并率、拒判率、单次匹配成本与端到端耗时分别度量。一次 LLM 验证只能处理已召回的候选，不能修复被召回层漏掉的记录。

## 后续兼容性验收建议

冻结当前千问模型与端点后再测试：单工具、多轮依赖、多工具同轮完整回传、模型提前结束、无效工具参数、JSON 截断、定位等待后续跑、工具失败、LLM 验证返回未知/非法 ID、循环上限。先验证一个 Agent 足够完成端到端流程，再决定是否需要更多 Agent。以上为建议清单，本轮没有执行在线验收。
