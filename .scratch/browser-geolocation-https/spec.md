# 公网 IP HTTPS 部署

日期：2026-10-09（Asia/Shanghai）。用户已明确授权按讨论方案执行。

## 目标

在 `47.85.138.198` 新增受浏览器信任的 HTTPS 入口，转发到现有 ReadytoGo `127.0.0.1:3000`，由 Caddy 自动申请和续期 Let's Encrypt IP 证书。

## 范围

- 使用官方 Caddy v2.11.7，核对发行包 SHA256。
- 新增独立配置、程序目录、systemd 服务和持久化证书目录。
- HTTPS 与证书验证使用 TCP 443；保留 80、8080 及 3000 的现有服务。
- 只补充必要的安全组入站 TCP 443 规则，保留其他规则。
- 验证证书链、IP SAN、HTTPS 健康/API/静态资产，以及原服务进程。
- 用户真实手机定位成功仍需真机许可和定位条件；不把 HTTP 或 TLS 检查当作真实定位验收。

## 预检

- SSH / IMDS 确认实例 `i-0xiaxm4fstyws01cgprs`，地域 `us-east-1`。
- Ubuntu 22.04.5 / x86_64；ReadytoGo 正常，443 与 2019 无监听。
- UFW inactive；临时监听 TCP 443 后公网连接超时，临时进程已自动退出。
- 本机没有阿里云 API/Workbench 云凭据，实例没有附加 RAM 角色；已检索插件，未发现可直接操作该阿里云账号的连接。

部署结果与未完成条件记录在 execution.md。
