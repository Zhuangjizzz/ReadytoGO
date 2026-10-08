# Qwen Text Models

## Defaults

- Default model: `qwen3.8-flash` (latest general-purpose Qwen model with both PAYG and Token Plan support).
- Strongest reasoning or coding: `qwen3.8-max`.
- Token Plan candidates are defined by the [Token Plan model catalog](https://alioth.alicdn.com/skills-info/models/references/qianwen-token-plan-models.md).

## Model catalog

| Model | Primary fit and basic information |
|-------|-----------------------------------|
| `qwen3.8-max` | Strongest flagship; 2.4T MoE; native vision-language; hybrid thinking on by default; 1M context; built-in tools. Best for complex reasoning and coding. |
| `qwen3.8-max-0902` | Latest Qwen3.8 Max snapshot; 1M context, improved coding, multi-agent collaboration, and visual understanding; PAYG only. |
| `qwen3.8-flash` | **Recommended default.** Latest general-purpose Qwen model; 125B MoE with 6B active parameters; multimodal text, image, and video; hybrid thinking on by default; 1M context; fast and cost-effective. |
| `qwen3.8-2.4t-a95b` | Open-source 2.4T MoE with 95B active parameters; 1M context; thinking-only; strong coding, office, research, and long-horizon Agent capabilities. |
| `qwen3.8-27b` | Open-source 27B dense vision-language model; hybrid thinking on by default; improved coding and office-task performance. |
| `qwen3.7-max` | Previous-generation agent model; 1M context; thinking mode, function calling, and built-in tools. Structured output is not supported. |
| `qwen3.7-plus` | Balanced multimodal vision-language model; enhanced Agent execution and coding; 1M context; thinking on by default. |
| `qwen3.7-flash` | Previous-generation lightweight model; multimodal text, image, and video; 1M context; full features at lower cost. |
| `qwen3.6-plus` | Multimodal text, image, and video; 1M context; thinking on by default; strong coding and universal recognition. |
| `qwen3.6-flash` | Fast multimodal Qwen3.6 model; 1M context; thinking on by default; function calling, built-in tools, structured output, and batch supported. |
| `qwen3.5-plus` | Balanced performance, cost, and speed; 1M context; thinking on by default. |
| `qwen3.5-flash` | Fast, low-cost model with 1M context. |
| `qwen3-max` | Legacy strongest-capability model with built-in web-search and code-interpreter tools. |
| `qwen-plus` | General-purpose text model. |
| `qwen-turbo` | Low-cost, low-latency text model. |
| `qwen3-coder-next` | Specialized agentic coding model balancing quality, speed, and cost. |
| `qwen3-coder-plus` | High-quality specialized code generation for complex tasks. |
| `qwen3-coder-flash` | Faster, lower-cost code generation. |
| `qwq-plus` | Chain-of-thought reasoning for math and other deep-reasoning tasks. |
| `qwen-long` | Ultra-long document processing with a 10M-token context. |
| `qwen-mt-plus` | Highest-quality machine translation; 92 languages. |
| `qwen-mt-flash` | Fast, low-cost machine translation; 92 languages. |
| `qwen-mt-lite` | Fastest translation tier for real-time chat; 31 languages. |
| `qwen-plus-character` | Role-playing with character restoration and empathetic dialogue. |
| `qwen-flash-character` | Faster, lower-cost role-playing. |

## Scenario recommendations

| Scenario | Recommended model | Notes |
|----------|-------------------|-------|
| General conversation / content generation | `qwen3.8-flash` | Recommended default; latest multimodal generation, 1M context, full tool support, and Token Plan + PAYG availability. |
| Multimodal text + image + video | `qwen3.8-flash` | Latest fast multimodal model; 1M context and thinking on by default. |
| Strongest reasoning / coding | `qwen3.8-max` | Latest flagship; native vision-language; hybrid thinking on by default; 1M context. |
| Fast next-generation model | `qwen3.8-flash` | Multimodal Qwen3.8 with 1M context; fast and cost-effective. |
| Qwen3.7 agent compatibility | `qwen3.7-max` | Thinking, function calling, built-in tools, and 1M context; structured output is not supported. |
| Balanced Agent and coding tasks | `qwen3.7-plus` | Thinking, function calling, built-in tools, and 1M context. |
| Lightweight Qwen3.7 tasks | `qwen3.7-flash` | Full Qwen3.7 features at the lowest cost in the series. |
| General conversation alternative | `qwen3.5-plus` | Balanced performance, cost, and speed; 1M context. |
| Low-latency real-time interaction | `qwen3.8-flash` | Latest fast multimodal model with 1M context. |
| Code generation / completion | `qwen3.8-max` | Strongest current coding model; use `qwen3.7-plus` for a quality/cost balance. |
| Deep reasoning / math | `qwen3.8-max` | Strongest current general reasoning model with thinking and built-in tools. |
| Ultra-long document processing | `qwen-long` | 10M-token context. |
| Agent / tool calling | `qwen3.8-max`, `qwen3.8-flash`, or `qwen3.7-plus` | Most complete function-calling and built-in-tool support. |
| Machine translation | `qwen-mt-plus` | Best quality; use `qwen-mt-flash` for speed or `qwen-mt-lite` for real-time chat. |
| Role-playing / character dialogue | `qwen-plus-character` | Character restoration and empathetic dialogue. |

## Capability and availability notes

- Function calling is supported by Qwen3.8 Max/Flash, Qwen3.7 Max/Plus/Flash, Qwen3.6 Plus/Flash, Qwen Max/Plus/Flash/Turbo, Qwen3.5/3/2.5 series, `qwen3-vl-plus`, `qwen3-vl-flash`, `qwen3.5-omni-plus`, `qwen3.5-omni-flash`, `qwen3-omni-flash`, and supported third-party DeepSeek, Kimi, and GLM models.
- Thinking is on by default for `qwen3.8-max`, `qwen3.8-max-0902`, `qwen3.8-flash`, `qwen3.8-27b`, `qwen3.7-max`, `qwen3.7-plus`, `qwen3.7-flash`, `qwen3.6-plus`, `qwen3.6-flash`, `qwen3.5-plus`, and `qwen3.5-flash`. `qwen3.8-2.4t-a95b` is thinking-only.
- Thinking is off by default for legacy hybrid models such as `qwen3-max`, `qwen-plus`, and `qwen-turbo`; enable it only when the task requires deeper reasoning.
- `qwen-long` and some third-party models are not available in `cn-beijing`. Verify the exact model ID and region before use.
