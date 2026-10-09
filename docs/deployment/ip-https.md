# 公网 IP HTTPS 运维

入口：`https://47.85.138.198/`。部署及证书证据见 [HTTPS 发布记录](../delivery/ip-https.md)。应用仍由 `readytogo.service` 在 3000 提供服务；HTTPS 由独立服务管理。

## 实际配置

| 项目 | 位置或值 |
| --- | --- |
| HTTPS 服务 | `readytogo-https.service`，active/enabled |
| 程序 | `/opt/readytogo-https/caddy-v2.11.7/caddy` |
| 配置 | `/etc/readytogo-https/Caddyfile` |
| unit | `/etc/systemd/system/readytogo-https.service` |
| 持久化状态 | `/var/lib/readytogo-https`，systemd DynamicUser 管理，0700 |
| 证书/ACME 状态 | `/var/lib/readytogo-https/data/caddy` |
| 管理接口 | 仅 `127.0.0.1:2019` |
| 协议 | TCP 443，HTTP/1.1、HTTP/2；不监听 UDP 443 |
| 上游 | `127.0.0.1:3000` |
| 证书 | Let's Encrypt `shortlived` IP 证书，TLS-ALPN-01 验证 |

仓库模板：[Caddyfile](https/Caddyfile)、[unit](https/readytogo-https.service)。不把私钥、ACME 账户状态或证书数据目录复制到仓库。程序目录和配置归 root 所有；服务只在专用 StateDirectory 中写入。

关闭 HTTP 自动跳转和 HTTP-01 验证，避免占用其他项目的 80 端口。`default_sni` 为不发送 SNI 的 IP 客户端选择正确证书。443 必须持续对用户和证书机构验证节点可达；IP 变化需要重新配置与签发，不能沿用旧 IP 证书。

## 配置更新与检查

修改前保存旧配置，确认 80、8080、3000 的服务归属。保持文件 root:root / 0644。校验和重载仅操作 HTTPS 服务：

```bash
sudo env XDG_DATA_HOME=/opt/readytogo-https/validation/data XDG_CONFIG_HOME=/opt/readytogo-https/validation/config /opt/readytogo-https/caddy-v2.11.7/caddy validate --config /etc/readytogo-https/Caddyfile --adapter caddyfile
sudo systemctl reload readytogo-https.service
sudo systemctl is-active readytogo-https.service
sudo systemctl is-enabled readytogo-https.service
curl --noproxy '*' --fail --show-error https://47.85.138.198/health
sudo journalctl -u readytogo-https.service --since '1 hour ago' --no-pager
```

IP 证书有效期约 160 小时。Caddy 常驻进程自动申请和续期，已有 ACME renewal information；不要另起 Certbot 或定时脚本争用 443。保留证书数据目录，关注续期错误和证书到期时间。首次签发及续期配置通过不等于未来续期已完成实测；开机启动已启用，但未重启整机验证。

服务日志可能提示 DynamicUser 没有 HOME；当前同时显式配置 XDG_DATA_HOME、XDG_CONFIG_HOME 和持久化工作目录，实际证书存储路径已核对。不要据此修改宿主机 HOME 或读取应用凭据。

## 回退

初次部署前快照：`/opt/readytogo/backups/before-ip-https-20261009`，包含原监听、应用 unit、运行 release 与主机防火墙规则；只作为记录，不整体恢复或覆盖其他服务配置。

要撤销 HTTPS，停止并禁用独立服务即可；原 `http://47.85.138.198:3000/` 仍可访问，但不满足公网浏览器定位的 HTTPS 条件：

```bash
sudo systemctl disable --now readytogo-https.service
curl --fail --show-error http://127.0.0.1:3000/health
```

保留程序、配置和证书状态以便恢复。配置回退应恢复对应旧 Caddyfile 后校验/重载。不要停止 ReadytoGo，不要撤销其他项目的 80/8080 规则。该回退步骤未在本次正式入口启用后实演。

## 官方依据

- [Caddy v2.11.7](https://github.com/caddyserver/caddy/releases/tag/v2.11.7)
- [ACME issuer 配置](https://caddyserver.com/docs/caddyfile/directives/tls#acme)
- [Caddy 证书自动化](https://caddyserver.com/docs/automatic-https)
- [Let's Encrypt IP 证书](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability/)
- [TLS-ALPN-01 支持 IP 及 443 验证](https://letsencrypt.org/docs/challenge-types/)
