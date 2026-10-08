# Domain Docs

本项目采用 single-context 布局：根目录的 `GLOSSARY.md` 记录领域术语，`docs/adr/` 记录架构决策。

## Before exploring, read these

- 阅读根目录的 `GLOSSARY.md`。
- 阅读 `docs/adr/` 中与当前工作相关的 ADR。
- 如果这些文件或目录不存在，直接继续，不报告缺失，也不预先创建。`domain-modeling` 技能会在术语或决策实际明确时按需创建。

## File structure

- `GLOSSARY.md`：本项目共享的领域术语表。
- `docs/adr/NNNN-<decision-slug>.md`：从 `0001` 开始编号的架构决策记录。

## Use the glossary's vocabulary

任务标题、重构建议、假设、测试名等输出涉及领域概念时，使用 `GLOSSARY.md` 中定义的术语，避免换成其中明确不采用的同义词。

需要的概念尚未收录时，先判断它是否符合项目已有语言；如果确实存在术语空缺，记录下来供 `domain-modeling` 处理。

## Flag ADR conflicts

如果方案与已有 ADR 冲突，明确指出该 ADR 的编号、冲突内容以及重新讨论该决策的理由。
