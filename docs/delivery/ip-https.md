# 公网 IP HTTPS 发布记录

日期：2026-10-09（Asia/Shanghai）。用户已明确授权部署；新增入口 **`https://47.85.138.198/`**。原业务 release 保持 `2fafc9c14934cccbde188a8613cf7ac8b85435e2`。

## 已执行

1. 通过 SSH / IMDS 确认实例、地域、架构及原服务状态；443 无监听。临时 TCP 443 监听时公网连接超时，探测进程已自动退出。
2. 用户随后报告已在阿里云控制台放行 443 和 80。代理没有修改安全组，也没有回读控制台规则；后续公网连接和多个证书机构验证节点成功访问 443，作为连通性证据。
3. 下载官方 Caddy v2.11.7 Linux amd64 发行包，SHA256 与 GitHub 发行元数据一致：`727b91701a392de6ebc5027509f548bf39979e5216340d0faed8fa5e69c84f8b`。实际二进制 SHA256：`678ade3bfc088749c81a681adc603333ee0bb023b6a6cfe3c0f58bef8ff854e9`。见[发行元数据](evidence/ip-https/caddy-release.json)。
4. 创建独立的 `readytogo-https.service`、配置和持久化目录，校验 Caddyfile 与 unit 后启动。首次通过 TLS-ALPN-01 正式签发 IP 证书。之后限制到 HTTP/1.1、HTTP/2 并重载，避免依赖未要求开放的 UDP 443。
5. 启用开机启动，确认运行时配置启用 `shortlived`、禁用 HTTP 验证、收到续期窗口信息。主应用和其他服务未重启，原 80、8080、3000 监听进程保持一致。

## 通过的验证

- [证书](evidence/ip-https/certificate.json)：本机默认信任链和 IP 校验通过；签发者 Let's Encrypt YE1，SAN 为 `47.85.138.198`，ALPN 协商 HTTP/2。没有跳过证书校验。
- 初始证书有效期：UTC 2026-10-09 02:27:53 至 2026-10-15 18:27:52；即北京时间 2026-10-09 10:27:53 至 2026-10-16 02:27:52。该日期为初始证书记录，续期后会变化。
- [公网 HTTPS](evidence/ip-https/https-verification.json)：北京时间 2026-10-09 11:28:35，`/health` 返回 ReadytoGo/ok；首页、JS、CSS 的 SHA256 全部匹配原发布 manifest；数据摘要接口 HTTP 200；首页没有 HTTP 静态资源引用。新增高德/模型调用均为 0。
- [服务末检](evidence/ip-https/service-state.json)：HTTPS active/running/enabled，管理接口只在本机；证书存储目录 0700，HTTP-01 禁用，续期信息已接收；原服务监听进程未变。

运维、配置和回退步骤见 [IP HTTPS 运维](../deployment/ip-https.md)。本次没有修改应用源码、业务 release、应用凭据或用户数据；README 和部署入口已更新。

## 边界

本次完成 TLS/HTTP/资产验证，没有新增实际应用浏览器或真实手机定位验收。HTTPS 已消除协议前置条件，定位仍需用户/系统允许且设备能取得位置。自动续期已配置并收到续期信息，但未来续期、整机重启和 HTTPS 回退未实演。

记录脚本的首轮服务末检误把 forme-footwear unit 的 MainPID 与其端口监听子进程 PID 比较而失败；改为比较相同端口的监听 PID 后通过。不是线上服务故障。
