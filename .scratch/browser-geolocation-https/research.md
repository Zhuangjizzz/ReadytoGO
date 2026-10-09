# 公网 HTTP 浏览器定位与 HTTPS 可行性

核查日期：2026-10-09。范围：解释限制与可行部署路径；未修改远程服务器。

## 结论

可以解决公网 HTTP 导致的定位限制。正式方案是给 ReadytoGo 提供浏览器信任的 HTTPS 入口。阿里云安全组 IP 白名单控制网络访问，不能把 HTTP 变为浏览器安全上下文；浏览器定位还要求用户授权，并可能受 `Permissions-Policy` 限制。[W3C Geolocation](https://www.w3.org/TR/geolocation/)、[阿里云安全组规则](https://help.aliyun.com/zh/ecs/user-guide/security-group-rules/)

## 本项目现状

- `docs/deployment/deployment.md` 记录当前入口为 `http://47.85.138.198:3000/`，域名与 HTTPS 在此前范围中暂缓。
- 同文明确 80 端口由 forme-footwear 使用、8080 由 sub2api 使用；两者须保持不变。本文未检查远端 443 是否空闲。
- `src/client/LocateButton.tsx` 检查 `window.isSecureContext` 和 `navigator.geolocation`；公网 HTTP 会触发现有保护逻辑。去掉判断仍无法绕过浏览器要求。
- `docs/delivery/acceptance.md` 的浏览器工具拒绝与真实手机未验收属于独立限制。HTTPS 能消除协议条件，但不能据此宣称工具可用或真实手机定位已通过。

## 可行路径

1. **域名 + HTTPS。** 将可用域名指向服务器，在经检查可用的 TLS 入口配置与访问域名匹配、受浏览器信任的证书，再反向代理到 ReadytoGo。安全组放行所选 HTTPS 端口仅用于保证可达。不要直接占用现有 80/8080 服务。[Chrome 安全来源定位说明](https://developer.chrome.com/blog/geolocation-on-secure-contexts-only/)、[阿里云安全组规则](https://help.aliyun.com/zh/ecs/user-guide/security-group-rules/)
2. **公网 IP + HTTPS。** 没有域名也并非无解。Let's Encrypt 于 2026-01-15 宣布 IP 地址证书正式可用，证书有效期 160 小时，需要可靠的自动签发、续期及服务加载；2026-03-11 官方进一步公布 Certbot 支持。必须部署绑定实际访问 IP 的有效受信任证书，并完成地址控制权验证；不能只把 URL 改成 HTTPS。[正式可用公告](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability/)、[Certbot 支持公告](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/)
3. **本机联调。** `http://localhost` 等回环来源可视为安全上下文，可通过本地端口转发测试。此例外只适用于访问者设备的本机来源，不会令其他用户访问公网 HTTP 时获得定位能力。[Chrome 安全来源定位说明](https://developer.chrome.com/blog/geolocation-on-secure-contexts-only/)

## 验收边界

HTTPS 解决浏览器安全上下文这一前置条件。交付还需实际检查证书信任、页面 `window.isSecureContext === true`、用户网站定位许可、浏览器及系统定位许可、策略允许定位，并在真实手机上确认成功/拒绝/超时路径。设备或环境仍可能导致无法取得位置，因此保留手动选择有意义；不能承诺每次均成功。[W3C Geolocation](https://www.w3.org/TR/geolocation/)

建议下一步先核实域名是否已有、443 占用与证书验证方式，再选择域名 HTTPS 或 IP HTTPS。以上为可行性建议，不代表已部署或已验收。


## 当前公网 IP 的具体配置方案

本次只读远端检查由主代理完成：2026-10-09，Ubuntu 22.04.5，ReadytoGo 的 3000 端口健康；80/8080 为既有其他服务；TCP 443 和 Caddy 管理端口 2019 无监听；`command -v caddy` 无输出；UFW inactive。阿里云安全组 443 放行情况尚未核实。

建议使用 Caddy 独立提供 `https://47.85.138.198/`，后端继续经 `127.0.0.1:3000` 访问。2026-10-09 核实官方当前稳定版为 **v2.11.7（2026-10-03 发布）**；下列配置按此版本制定，不能假设旧版也支持相同 IP 验证流程。官方锁定依赖含 CertMagic v0.25.6 和 acmez v3.1.7；后者 TLS-ALPN-01 实现明确支持 `ip` 标识符。[Caddy 发布记录](https://github.com/caddyserver/caddy/releases/tag/v2.11.7)、[锁定依赖](https://github.com/caddyserver/caddy/blob/v2.11.7/go.mod)、[IP 验证实现](https://github.com/mholt/acmez/blob/v3.1.7/tlsalpn01.go)

部署步骤（待执行）：

1. 确认公网 IP 仍分配给本机、443 无冲突，阿里云安全组允许公网 **TCP 443** 入站，主机防火墙和出口能完成 ACME 通信。只允许个人客户端 IP 会挡住证书机构的验证请求。
2. 安装官方 Caddy v2.11.7，先准备下列完整配置及独立服务，再启动；避免软件包默认站点先抢占现有 80。为服务准备可写、持久化的证书数据目录。
3. 按下列配置提供 HTTPS 并代理至应用；不改动 80/8080。通过 `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 后，用 systemd 启动/重载 Caddy。
4. 检查 ACME 日志取得正式证书、证书 SAN 含目标 IP、完整信任链有效，并验证 `https://47.85.138.198/health` 和首页。切勿用跳过证书校验的结果作为通过证据。
5. 使用新 HTTPS 地址在真实手机上验收定位。让 Caddy 常驻并保留证书状态，由其自动续期；第一次签发成功不代表后续续期已经实际验证。

```caddyfile
{
    auto_https disable_redirects
    default_sni 47.85.138.198
}

https://47.85.138.198 {
    tls {
        issuer acme https://acme-v02.api.letsencrypt.org/directory {
            profile shortlived
            disable_http_challenge
        }
    }
    reverse_proxy 127.0.0.1:3000
}
```

配置的两个关键点是关闭 HTTP 自动跳转和 HTTP-01 验证，只保留 **TLS-ALPN-01 在 443 验证**。Let's Encrypt 官方确认该验证方法支持 IP，且适合 80 无法使用的场景；DNS-01 不支持 IP 证书。显式 ACME issuer 避免依赖 IP 站点默认的内部证书行为。[Caddy TLS 配置](https://caddyserver.com/docs/caddyfile/directives/tls#acme)、[Caddy 自动 HTTPS 选项](https://caddyserver.com/docs/caddyfile/options#auto_https)、[Let's Encrypt 验证方式](https://letsencrypt.org/docs/challenge-types/)

`default_sni` 为没有发送 SNI 的客户端选取目标 IP 证书；特别用于公网 IP 与本机网卡地址不一致的情况。这是根据 Caddy 官方配置与证书选择源码制定的兼容设置，尚未在本服务器握手验收。[default_sni](https://caddyserver.com/docs/caddyfile/options#default_sni)、[证书选择源码](https://github.com/caddyserver/certmagic/blob/v0.25.6/handshake.go#L110-L128)

该方案不需要另写证书更新脚本；Caddy 管理证书更新，运维仍需保证服务和 443 验证长期可用，以及数据目录不被清空。[Caddy 证书自动化](https://caddyserver.com/docs/automatic-https)、[服务运行说明](https://caddyserver.com/docs/running)
