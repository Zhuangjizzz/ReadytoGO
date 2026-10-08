# Qwen Text Chat — API Supplementary Guide

> **Content validity**: 2026-08 | **Sources**: [OpenAI compatibility](https://platform.qianwenai.com/docs/api-reference/preparation/install-sdk) · [Qwen API](https://platform.qianwenai.com/docs/api-reference/chat/dashscope) · [Function calling](https://platform.qianwenai.com/docs/developer-guides/text-generation/function-calling) · [Models](https://www.qianwenai.com/models)

---

## Definition

Qwen text generation models accessed through an **OpenAI-compatible** interface. Migrate existing OpenAI code by updating three values: `base_url`, `api_key`, and `model`. Supports text generation, multi-turn conversations, code writing, reasoning, and function calling.

---

## Use Cases

Fetch and read the current [Qwen text model catalog](https://alioth.alicdn.com/skills-info/models/references/qianwen-text-models.md) for model recommendations, defaults, and basic model information. If CDN access fails, use the [local fallback](../cdn/references/qianwen-text-models.md).

---

## Key Usage

### Regional Endpoints

| Region | base_url |
|--------|----------|
| Beijing (default) | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

### Non-streaming Call

```python
from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
resp = client.chat.completions.create(
    model="qwen3.7-plus",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"},
    ],
)
print(resp.choices[0].message.content)
```

### Streaming (recommended for interactive use)

```python
stream = client.chat.completions.create(
    model="qwen3.7-plus",
    messages=[{"role": "user", "content": "Write a haiku."}],
    stream=True,
    stream_options={"include_usage": True},
)
for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### Function Calling

Workflow: **Define tools → Model returns tool call instruction → Execute tool → Send result back → Get final answer.**

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get weather for a city",
        "parameters": {
            "type": "object",
            "properties": {"location": {"type": "string"}},
            "required": ["location"],
        },
    },
}]

resp = client.chat.completions.create(
    model="qwen3.7-plus",
    messages=[{"role": "user", "content": "What's the weather in Beijing?"}],
    tools=tools,
)
# resp.choices[0].message.tool_calls contains function name and arguments
# Execute the function, then send result back with role="tool"
```

For the current function-calling model list, fetch and read the CDN model catalog linked above.

### Thinking Mode

Fetch and read the CDN model catalog linked above for current thinking-mode defaults and compatible models. Only override a model's default when the user explicitly requests it or the task requires it:

```python
# For a model whose documented default is thinking on, no need to set it
resp = client.chat.completions.create(
    model="qwen3.6-plus",
    messages=[{"role": "user", "content": "Solve this problem."}],
)

# For a model whose documented default is thinking off, enable only when requested
resp = client.chat.completions.create(
    model="qwen3-max",
    messages=[{"role": "user", "content": "Solve 17 × 23 step by step."}],
    extra_body={"enable_thinking": True},  # Only for non-default models
)

# Script usage: add --enable-thinking flag to override defaults
# python scripts/text.py --request '{"messages":[...]}' --enable-thinking
```

**When to disable thinking**: After checking the model's current default in the CDN catalog, set `enable_thinking: false` for simple chat, real-time interaction, or when you want faster responses without extended reasoning.

### Key Request Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | **Required.** Model ID. |
| `messages` | array | **Required.** Conversation history. Format: `{"role": "...", "content": "..."}`. Roles: `system`, `user`, `assistant`. `system` can only appear at `messages[0]`. Last element must have `user` role. |
| `temperature` | float | Controls randomness. Range: [0, 2). Higher values produce more diverse output. |
| `top_p` | float | Nucleus sampling threshold. Range: (0, 1.0]. |
| `max_tokens` | int | Maximum number of output tokens. |
| `stream` | bool | Enable streaming output. |
| `tools` | array | Tool definitions for function calling. |
| `stop` | string/array | Stop generation when specified string or token is about to be output. |

### Key Response Fields

| Field | Description |
|-------|-------------|
| `choices[0].message.content` | Generated text. |
| `choices[0].message.tool_calls` | Tool call instructions (if applicable). |
| `choices[0].finish_reason` | `stop` = normal completion; `length` = max_tokens reached. |
| `usage.prompt_tokens` / `completion_tokens` | Token consumption. |

---

## Important Notes

1. **Prefer streaming.** Non-streaming blocks until the full response is generated (10–60s+ for long outputs). Always use `stream=True` for interactive scenarios.
2. **API keys are region-specific.** Use the `cn-beijing` (Beijing) endpoint with your API key.
3. **openai SDK version:** Requires ≥1.55.0. Older versions conflict with httpx ≥0.28, causing a `proxies` TypeError.
4. **Thinking mode varies by model.** Fetch the CDN model catalog linked above for current defaults and only override them deliberately.
5. **Function calling constraints.** `tools` works with `stream=True` on current models (the tool name arrives in the first chunk and arguments accumulate across subsequent chunks). Still incompatible with `n > 1`.
6. **messages format.** `system` role can only appear at `messages[0]`. The last message must have the `user` role.
7. **Regional availability is model-specific.** Check the CDN model catalog for the documented regions before choosing a model.

---

## FAQ

**Q: How do I migrate from OpenAI?**
A: Change three values: `api_key` to your DASHSCOPE_API_KEY, `base_url` to the corresponding regional endpoint, and `model` to a Qwen model name. All other code remains compatible.

**Q: When should I use streaming vs. non-streaming?**
A: Use streaming for interactive scenarios (chat, real-time output). Use non-streaming for batch processing or when you need the complete JSON response at once. With streaming, set `stream_options={"include_usage": True}` to receive token usage in the last chunk.

**Q: Which models support function calling?**
A: Fetch and read the current CDN model catalog linked above.

**Q: What is the difference between `qwen3.7-plus` and `qwen3.6-plus`?**
A: Fetch and read the current CDN model catalog linked above for model comparisons and the recommended default.

**Q: How do I control output length?**
A: Use `max_tokens` to limit output token count. Use `stop` to set stop sequences. Each model has its own default output limit.

**Q: What should I do when I get a 429 error?**
A: 429 indicates QPS/QPM rate limit exceeded or insufficient quota. Implement exponential backoff retry, or check remaining quota in the console.
