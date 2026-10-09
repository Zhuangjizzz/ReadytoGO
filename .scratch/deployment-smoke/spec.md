# 公网部署链路验证

## 目标

本阶段在用户现有阿里云服务器上跑通最小网页的部署与公网 IP＋端口访问，为后续 ReadytoGo 发布做准备。用户于 2026-10-09 明确选择先不绑定域名，域名解析与 HTTPS 延后处理，不作为本阶段完成条件。

## 已确认的实例

- 公网 IP：`47.85.138.198`
- ECS 实例 ID：`i-0xiaxm4fstyws01cgprs`
- 地域：`us-east-1`，美国弗吉尼亚
- 系统：Ubuntu 22.04 64 位；控制台显示运行中，2 vCPU、4 GiB 内存
- 网页 Workbench 免密连接已启用；本次连接成功，`id -un` 返回 `root`
- 服务器 PATH 中已有 `/usr/bin/node`、`/usr/bin/docker`、`/usr/bin/python3`
- 80 端口由 `/opt/forme-footwear` 的 `forme-footwear.service` 使用；8080 端口由 `sub2api` Docker 容器使用，其 Redis、Postgres 容器也在运行。
- 新验证页部署后，原有站点仍返回 HTTP 200，原有服务与三个容器仍处于运行/健康状态。

## 本机连接状态

- 先前 SSH 公网 22 端口可达，但旧客户端密钥未被接受，服务器未提供密码认证。
- Workbench CLI v1.0.1 和项目级官方技能已安装；CLI 云凭据尚未配置。
- 网页登录凭据不会自动成为本机 CLI 的 AccessKey/STS 凭据。
- 已生成专用 SSH 密钥，私钥保存在本机 `~/.ssh/`，不在 Git 仓库内。用户于 2026-10-09（Asia/Shanghai）明确同意后，已通过网页 Workbench 追加对应公钥；本机 SSH 验证 `id -un` 返回 `root`。

## 已执行的 SSH 配置

已利用登录的网页 Workbench，把本机专用公钥追加到 `/root/.ssh/authorized_keys`，用于后续 SSH 上传与部署。

执行脚本：`authorize-deploy-ssh.sh`。它检查 root 身份及非符号链接路径，确保 SSH 目录和文件权限，并以幂等方式追加一条公钥。

公钥指纹：`SHA256:ZXBaH565v1pkmZTnZ2zP9x8oy3Q1xOngsyrsaOg0j5o`。

此操作让持有对应本机私钥的一方能够以 root 登录该实例。已取得用户即时确认；结果截图见 `workbench-ssh-authorized.jpg`。

## 已完成的最小部署

- 源文件：`site/`，只使用 Node 内置模块，无需额外 npm 依赖。
- 部署目录：`/opt/readytogo-smoke`；服务：`readytogo-smoke.service`；监听：`0.0.0.0:3000`。
- 服务已启动并启用开机启动，使用 systemd DynamicUser 运行；开机启动配置已确认，未重启服务器做实测。
- 只上传了 4 个网页/服务文件与 1 个服务配置，未上传 `.env`、API Key、SSH 私钥或业务数据。
- 本地通过 9 项 HTTP 检查：页面、静态资源、健康检查、HEAD、敏感/非公开路径 404、非读取方法 405。记录见 `local-checks.json`。
- 服务器本机 `/healthz` 返回 `{"service":"readytogo-smoke","ok":true,...}`。
- 已通过临时 SSH 转发，在浏览器打开服务器实际页面，并验证“重新检查连接”按钮恢复到“连接正常”。这项预览不代表公网端口已打通。

## 已生效的安全组规则

最初从本机访问 `47.85.138.198:3000` 超时。控制台确认实例关联安全组 `sg-0xiaxm4fstyws01c1v6v`，当时入方向允许 TCP 80、8080、3389、22 及 ICMP，缺少 TCP 3000。

用户确认先使用公网 IP 开放端口后，已提交以下单条规则，控制台显示创建时间为 2026-10-09 00:26:31（Asia/Shanghai）：

- 授权策略：允许；优先级：1。
- 协议：自定义 TCP；目标端口：3000。
- 来源：IPv4 `0.0.0.0/0`（任何位置）。
- 描述：`ReadytoGo deployment smoke test (TCP 3000)`。
- 配置记录：`security-group-3000-draft.json`（保留最初草稿文件名，`submitted` 已更新为 `true`）。
- 原草稿截图：`security-group-3000-pending.jpg`；生效记录截图：`security-group-3000-active.jpg`。两张截图包含云账号与额度信息，仅保留在本地并由 `.gitignore` 排除；仓库保留 `security-group-3000-draft.json` 与 `connection.json` 中的部署摘要。

来源为任意 IPv4 地址，目标仅 TCP 3000。其他安全组规则未变更。

## 公网验证结果

- 访问地址：`http://47.85.138.198:3000/`。
- 从本机直接访问公网 IPv4，页面与 `/healthz` 均返回 HTTP 200；未使用 SSH 转发或 HTTP 代理。
- `/healthz` 返回 `service=readytogo-smoke`、`ok=true`。
- `/.env` 与 `/server.mjs` 均返回 404。
- 浏览器直接打开公网页面，显示“已载入”和“连接正常”；截图见 `public-page.jpg`，请求验证记录见 `public-checks.json`。

## 阶段结论与后续

本阶段完成：本机 SSH 登录 → 上传代码 → 服务运行 → 公网 IP＋3000 端口访问 → 浏览器后端检查。

域名与 HTTPS 按用户要求暂缓，DNS 未修改。后续如果验证手机浏览器自动定位，需要另行满足 Geolocation API 的安全上下文要求；参考 MDN Geolocation API 文档 `https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API`。

连接元信息见 `connection.json`。这里部署的是测试站点，尚未实现 ReadytoGo 业务功能。

## 后续部署与远程 API 确认

后续部署、更新和回滚按 [部署流程](../../docs/deployment/deployment.md) 执行，本文保留首次部署的验证记录。

已在目标 ECS 上用临时进程验证千问文本生成，以及高德关键词搜索、周边搜索、步行路线、坐标转换；五项均通过 HTTP 状态与响应内容检查。凭据经 SSH 标准输入传入，未写入远程文件。脱敏结果及取数时间见 `remote-api-checks.json`；本次确认不包含向长期运行的业务服务配置凭据。
