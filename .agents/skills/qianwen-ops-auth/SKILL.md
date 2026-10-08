---
name: qianwen-ops-auth
description: 配置 ReadytoGo 的千问模型凭据、地域和调用地址，排查鉴权失败及模型访问权限。
compatibility: 使用 Python 3.9+ 或项目 Node.js；模型调用不依赖千问 CLI 登录。
---

# ReadytoGo 千问认证

来源与项目裁剪见 UPSTREAM.md。

1. 检查进程环境和项目 `.env` 中的变量名及是否有值，禁止展示值或密钥片段。
2. 本项目以 `DASHSCOPE_API_KEY` 为凭据名，`QWEN_REGION`、`QWEN_BASE_URL`、`QWEN_MODEL` 为配套配置。上游脚本兼容 `QIANWEN_API_KEY` 且优先于前者；存在冲突时报告变量名，不静默切换用户账户。
3. `.env` 已获用户授权写入时可直接配置；保证文件被 Git 忽略、权限为 0600，`.env.example` 中凭据留空。
4. 本项目普通模型调用的官方默认地域为 `cn-beijing`，兼容 Base URL 为 `https://dashscope.aliyuncs.com/compatible-mode/v1`。有用户明确提供的业务空间 Host 时使用其配置。一次失败不能直接判定 Key 无效；区分 401、地域不匹配、模型不存在、权限不足和余额问题。
5. 验证使用用户任务所需的已知模型和一条短的非个人测试输入，限制输出及超时，记录 HTTP 状态、模型、成功与否、用量和耗时。无需展示原始错误请求、Authorization 头或完整请求 URL。
6. 用 `qianwen-text/scripts/qianwen_lib.py` 的 `detect_api_key_type` 做非明文检查。前缀推断只用于识别调用模式，不证明 Key 有效。产品后端使用普通模型调用 Key。

## CLI 的边界

模型 API Key 与千问 CLI 的浏览器登录会话是两套认证。核心文本调用无需 CLI。只有用户需要 CLI 的账户用量、账单等管理功能时才安装和登录；参考官方 `qianwen-usage` 技能，不把 API Key 当成 CLI 会话。

认证配置只作用于本项目，不写入全局 shell 配置或其他项目。

- [API Key 控制台](https://platform.qianwenai.com/home/api-keys)
- [官方 Base URL](https://help.aliyun.com/zh/model-studio/base-url)
- [用量控制台](https://platform.qianwenai.com/home/analytics)
