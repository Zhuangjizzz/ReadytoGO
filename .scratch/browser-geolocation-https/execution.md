# IP HTTPS 执行结果

日期：2026-10-09（Asia/Shanghai）。

用户授权部署后，完成 Caddy v2.11.7 安装、独立配置/unit 校验、正式 IP 证书签发、HTTPS 转发、自动续期配置和开机启动。

首次 443 预检超时；用户在本轮告知已添加 443/80 规则后，公网及证书机构的 TLS-ALPN-01 验证成功。代理未修改或回读安全组。

交付入口：`https://47.85.138.198/`。

完整结果：[HTTPS 发布记录](../../docs/delivery/ip-https.md)。可重复运维：[IP HTTPS 运维](../../docs/deployment/ip-https.md)。

HTTP 健康、首页及 JS/CSS 内容摘要通过，原 80/8080/3000 监听进程不变。真实手机定位仍由实际设备确认；不声明已完成真机验收。
