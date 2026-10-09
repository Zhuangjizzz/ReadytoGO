# ReadytoGo

面向入境游客的如厕助手。围绕北京东城区、西城区的单起点急需流程，由 AI 理解需求、调用高德搜索、按名称语义召回本地记录、判断对应厕所并输出结构化结果，网页负责渲染。

## 产品文档索引

处理产品需求或实现任务时，先读 PRD 总入口，再按任务类型读取对应细则。各细则是同一份 PRD 的组成部分。

| 文档 | 何时阅读 |
| --- | --- |
| [PRD 总入口](docs/ReadytoGo-PRD-v2.0-Beijing.md) | 了解已确认的开发范围、主流程和文档权威关系 |
| [用户流程与多语言](docs/prd/experience.md) | 设计页面、偏好交互、定位、导航、询问卡或小贴士 |
| [偏好、证据与推荐规则](docs/prd/rules.md) | 实现候选过滤、证据标记、设施等级、开放信息或排序 |
| [AI 工具调用与结构化输出](docs/prd/ai.md) | 实现需求解析、搜索工具调用、本地匹配、结构化结果或输出校验 |
| [数据处理与接口契约](docs/prd/data-and-api.md) | 处理政府数据、高德服务、本地资料匹配、坐标、分页或工具接口 |
| [验收与异常状态](docs/prd/acceptance.md) | 验证行为、失败回退、数据质量和结果可追溯性 |
| [范围决策与整理记录](.scratch/prd-restructure/spec.md) | 追溯本次讨论结论和文档调整 |

PRD 已收拢，作为网页实现与验收的输入。匹配算法、召回条数和判断阈值等技术细节在实施中确定，边界见 AI 契约。文档定稿不代表网页或接口流程已实现。

## Agent SDK 开发资料

[开发指南](docs/agent-sdk/agent-development.md) · [API 参考](docs/agent-sdk/api-guide.md) · [官方来源](docs/agent-sdk/sources.md)：原生 OpenAI SDK 与千问模型的工具调用、Agent 循环和 Skill 编写。

## 设计与协作

| 文档 | 何时阅读 |
| --- | --- |
| [设计约定](DESIGN.md) | 创建或调整界面时读取视觉与组件参考 |
| [Agent 入口](AGENTS.md) | 开始仓库任务 |
| [本地需求与任务](docs/agents/issue-tracker.md) | 创建、读取或更新需求与任务 |
| [分诊标签](docs/agents/triage-labels.md) | 评估任务或更新分诊状态 |
| [领域文档约定](docs/agents/domain.md) | 探索代码或维护领域术语、架构决策 |

## 原始资料与验证记录

- [两份产品原稿及整合说明](.scratch/prd-restructure/sources/README.md)：供追溯原始需求，不作为并列开发指令。
- [政府公厕 CSV](data/BJ-ToiletInfo.csv)：现有输入文件；清洗与字段校验按数据细则执行。
- [API 准备记录](.scratch/api-readiness/spec.md)：查看已有接口验证及其限制。
