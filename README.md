# ReadytoGo

北京入境游客如厕助手 Demo：整合公厕资料和高德地点信息，用 AI 理解行程、分析设施与解释推荐，完成附近搜索、景点规划和导航的手机网页流程。

## 产品文档

开发前先读 [PRD 总入口](docs/prd/README.md)，再按任务读取细则。当前目标是能力展示与想法验证，需求已按 Demo 简化。

| 文档 | 何时阅读 |
| --- | --- |
| [PRD 总入口](docs/prd/README.md) | 了解交付目标、功能范围与开发顺序 |
| [用户流程与双语](docs/prd/experience.md) | 实现页面、规划、地图、导航、询问卡和保存 |
| [需求与推荐规则](docs/prd/rules.md) | 实现设施线索、范围、分组、排序和进入条件 |
| [AI 分析与结构化输出](docs/prd/ai.md) | 实现行程理解、资料匹配辅助与推荐说明 |
| [数据处理与接口](docs/prd/data-and-api.md) | 导入文件、匹配位置、实现查询与接口 |
| [Demo 验收](docs/prd/acceptance.md) | 检查演示主线、异常恢复和交付完整性 |

[本轮决策记录](.scratch/prd-v1-alignment/spec.md)用于追溯范围调整。文档已整理，功能实现与运行结果按后续开发记录说明。

## 开发参考

- [Agent 开发参考](docs/agent-sdk/agent-development.md)、[API 参考](docs/agent-sdk/api-guide.md)、[官方来源](docs/agent-sdk/sources.md)：原生 OpenAI SDK 与千问接入，业务职责以 AI 细则为准。
- [设计约定](DESIGN.md#readytogo-使用约定)、[UI Demo](docs/ui/index.html)：后续界面开发的视觉、布局与交互参考，使用边界见设计约定。
- [部署流程](docs/deployment/deployment.md)：部署、回滚和远程访问排查。
- [Agent 入口](AGENTS.md)、[本地任务](docs/agents/issue-tracker.md)、[分诊标签](docs/agents/triage-labels.md)、[领域文档](docs/agents/domain.md)：协作约定。

## 数据与已有记录

- [公厕 CSV](data/BJ-ToiletInfo.csv)：当前可直接使用的输入文件。
- [API 准备记录](.scratch/api-readiness/spec.md)：已执行的联调及其环境限制。
- [原始资料索引](.scratch/prd-v1-alignment/sources/README.md)：保存需求原稿，日常开发无需加载。
