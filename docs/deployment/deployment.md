# 部署到远程服务器

本流程用于从本地发布代码、更新服务和验证公网访问。当前已跑通测试站点，使用公网 IP＋端口；域名与 HTTPS 按用户决定暂缓。

## 当前部署位置

| 项目 | 值 |
| --- | --- |
| SSH | `root@47.85.138.198:22` |
| 本机私钥 | `~/.ssh/readytogo_47_85_138_198_ed25519`，保存在仓库外 |
| 公网地址 | `http://47.85.138.198:3000/` |
| 远程目录 | `/opt/readytogo-smoke` |
| systemd 服务 | `readytogo-smoke.service`，已启用开机启动 |
| 示例源码与服务配置 | [测试站点](../../.scratch/deployment-smoke/site/)、[systemd unit](../../.scratch/deployment-smoke/readytogo-smoke.service) |

以下命令更新当前测试站点。正式应用落地后，按实际构建产物、启动命令和健康检查同步更新本文。服务器的 80、8080 端口已有其他项目使用；新增服务先检查端口，并使用独立目录和服务名。

## 1. 连接并检查目标

在项目根目录的 Bash 会话中执行，后续步骤沿用这些变量：

```bash
RTG_HOST=root@47.85.138.198
RTG_KEY="$HOME/.ssh/readytogo_47_85_138_198_ed25519"
RTG_SSH=(ssh -i "$RTG_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes "$RTG_HOST")
"${RTG_SSH[@]}" 'id -un; node --version; df -h /; ss -ltnp'
"${RTG_SSH[@]}" 'systemctl status readytogo-smoke.service --no-pager'
```

完成条件：连接到预期实例，返回 `root`，确认磁盘空间、监听端口和目标服务状态。换电脑时，先配置该电脑的 SSH 公钥并核实服务器主机指纹；连接建立后再继续上传。

## 2. 准备发布内容与配置

- 按项目实际的运行脚本和锁文件完成构建及必要检查；只整理运行所需的代码、产物、配置模板与数据。
- 当前测试站点使用 Node 内置模块，上传 `site/` 中的四个文件即可；可先用 `node --check` 检查 `server.mjs` 和 `app.js`。
- 应用引入依赖后，在 Linux 环境按锁文件安装或构建依赖，上传清单排除本机 `node_modules`。
- API 密钥单独配置在服务器，例如 `/etc/readytogo/readytogo.env`，权限设为 `0600`，由 systemd 的 `EnvironmentFile=` 加载。变量定义见 [.env.example](../../.env.example)；发布包排除 `.env`、SSH 私钥和本地日志。

完成条件：本地检查通过，上传清单明确；需要 API 的业务服务已有独立的服务端凭据配置。当前静态验证页不需要 API 凭据。

## 3. 备份并上传

更新现有服务前，记录本次代码版本和备份路径。当前测试站点的更新示例：

```bash
RTG_BACKUP="/opt/readytogo-smoke-backup-$(date +%Y%m%d-%H%M%S)"
"${RTG_SSH[@]}" "test ! -e '$RTG_BACKUP' && cp -a /opt/readytogo-smoke '$RTG_BACKUP'"
scp -i "$RTG_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  .scratch/deployment-smoke/site/{server.mjs,index.html,style.css,app.js} \
  "$RTG_HOST:/opt/readytogo-smoke/"
```

完成条件：备份存在，清单中的文件全部上传成功。任一步失败时先处理失败，再进入启动步骤。若修改 systemd unit 或服务端配置，同时保留它们的备份。

## 4. 启动或更新服务

当前服务在启动时读取网页文件，更新文件后重启目标服务：

```bash
"${RTG_SSH[@]}" 'systemctl restart readytogo-smoke.service'
"${RTG_SSH[@]}" 'systemctl is-active readytogo-smoke.service'
```

首次部署新服务时：创建独立远程目录，上传代码；参考现有 unit 设置工作目录、启动命令、端口和运行用户，安装到 `/etc/systemd/system/`。使用 `systemd-analyze verify` 检查 unit 后，执行 `systemctl daemon-reload` 和 `systemctl enable --now <服务名>`。修改已有 unit 时，也先校验并重新加载，再重启对应服务。

完成条件：目标服务处于 `active`，启动命令、端口及配置文件与本次发布一致。开机启动是否启用用 `systemctl is-enabled <服务名>` 检查。

## 5. 验证访问

先从服务器内部检查，再从本机直接访问公网：

```bash
"${RTG_SSH[@]}" 'curl --fail --max-time 10 http://127.0.0.1:3000/healthz'
curl --fail --connect-timeout 5 --max-time 10 http://47.85.138.198:3000/healthz
```

完成条件：两次请求均返回 HTTP 200 和预期健康检查内容；浏览器打开公网地址后，页面及其后端请求均正常。当前站点应显示“连接正常”，接口应返回 `service=readytogo-smoke`、`ok=true`。

内网正常而公网超时时，检查进程是否监听 `0.0.0.0`、系统防火墙及阿里云安全组。当前 TCP 3000 已对公网 IPv4 放行；改变端口时，重新核对对应规则。需要验证 API 时，从服务器发出小规模真实请求，并核对业务结果及错误码。

完成后将版本、部署目录、备份路径和验证结果写入本次任务记录。首次连通证据见 [部署验证记录](../../.scratch/deployment-smoke/spec.md)。

## 失败与回滚

服务启动或健康检查失败时，先看目标服务日志：

```bash
"${RTG_SSH[@]}" 'journalctl -u readytogo-smoke.service -n 50 --no-pager'
```

需要回滚时，将失败的代码目录改名保留，把步骤 3 记录的完整备份恢复到 `/opt/readytogo-smoke`。若改过 unit 或配置，一并恢复并重新加载 systemd；随后重启目标服务，重复步骤 5。公网检查重新通过才算回滚完成。

后续启用浏览器自动定位时，再补齐 HTTPS；公网 HTTP 验证通过只说明当前部署和访问链路可用。
