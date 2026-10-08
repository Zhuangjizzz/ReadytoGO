# 发布、运行与回滚

ReadytoGo 以独立 Node 服务运行在既有公网端口 3000。域名与 HTTPS 按当前范围暂缓。实际已执行的版本、时间、健康/API、端口和回滚证据见[发布记录](../delivery/deployment-record.md)，此文定义可重复步骤。

## 位置与运行约定

| 项目                | 值                                                                              |
| ------------------- | ------------------------------------------------------------------------------- |
| SSH                 | `root@47.85.138.198:22`                                                         |
| 本机私钥            | `~/.ssh/readytogo_47_85_138_198_ed25519`，仓库外                                |
| 公网入口            | `http://47.85.138.198:3000/`                                                    |
| 版本目录 / 当前链接 | `/opt/readytogo/releases/<完整提交SHA>` / `/opt/readytogo/current`              |
| 正式服务            | `readytogo.service`；[unit 模板](readytogo.service)                             |
| 配置                | `/etc/readytogo/readytogo.env`，root:root，0600                                 |
| 正式状态            | `StateDirectory=readytogo`，`/var/lib/readytogo/catalog.json` 和 `matches.json` |
| 原 smoke            | `/opt/readytogo-smoke`、`readytogo-smoke.service`，保留作为首次发布回滚目标     |

80 属于 forme-footwear 服务，8080 属于 sub2api 容器，不修改其服务、目录、代理、端口或安全组。3000 已有公网 IPv4 放行。公开 HTTP 通常不能使用浏览器定位，界面必须保留手选；不能把 HTTP 健康检查当成 HTTPS/定位已实现。

## 1. 冻结代码并打包

在本次受检工作树完成 `npm ci`、`npm test`、`npm run check`、`npm run build`，先提交运行代码，记录完整 SHA。之后整理允许清单：`package.json`、`package-lock.json`、完整 `dist/`、原 `data/BJ-ToiletInfo.csv`。归档排除 `.env`、私钥、本机 node_modules、`.scratch`、日志及 generated 缓存。

```bash
RTG_SHA=$(git rev-parse HEAD)
RTG_ARCHIVE=/tmp/readytogo-$RTG_SHA.tgz
COPYFILE_DISABLE=1 tar -czf "$RTG_ARCHIVE" package.json package-lock.json dist data/BJ-ToiletInfo.csv
shasum -a 256 "$RTG_ARCHIVE"
```

服务器 Node 需满足 `package.json` 的 >=22.12；实际验证 Node24.15.0/npm11.12.1。服务器 bundle 仍引用外部 npm 包，因此在每个新 Linux release 内运行 `npm ci --omit=dev --no-audit --no-fund`，不传 macOS 依赖。主服务缺 catalogue 时自动导入CSV，生产不运行依赖 tsx 的 `npm run import:data`。

## 2. 连接、备份和上传

```bash
RTG_TARGET=root@47.85.138.198
RTG_KEY="$HOME/.ssh/readytogo_47_85_138_198_ed25519"
RTG_SSH=(ssh -i "$RTG_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes "$RTG_TARGET")
"${RTG_SSH[@]}" 'id -un'
"${RTG_SSH[@]}" 'node --version'
"${RTG_SSH[@]}" 'df -h /'
"${RTG_SSH[@]}" 'ss -ltnp'
```

检查当前3000的服务归属，以及待用回环端口（本次33001）无监听。首次替换smoke前备份其目录和unit，保留原文件。后续发布记录 `current` 的旧目标，备份旧unit、root-only环境文件及必要状态；新release必须此前不存在，不能原地覆盖运行版本。

上传归档到 `/opt/readytogo/uploads/`，核对远程SHA256一致，解包到新release后安装生产依赖。代码、node_modules和原CSV归root所有、服务可读；所有运行写入走 StateDirectory。

配置只需四项：`AMAP_KEY`、`DASHSCOPE_API_KEY`、`QWEN_BASE_URL`、`QWEN_MODEL`。从本机已有忽略的`.env`解析白名单，在内存中编码后通过 **SSH stdin** 写入远程同目录临时文件，再rename为目标，设置root:root和0600。不得echo、shell trace、放入命令行参数、Git或归档。更新已有配置前先保存0600备份。

EnvironmentFile会覆盖unit中同名Environment项，因此该凭据文件不放PORT/HOST/状态路径。systemd在启动进程前读取root-only文件，DynamicUser无需直接读取该文件。AI缓存目前在内存，没有AI_CACHE_PATH。

## 3. 回环预发布

正式与stage使用同一受检release和四项凭据。stage使用独立StateDirectory，HOST=127.0.0.1、PORT=33001，避免暴露或与正在运行的正式服务共写cache。远程Bash示例：

```bash
RTG_RELEASE=/opt/readytogo/releases/$RTG_SHA
RTG_STAGE=readytogo-stage-${RTG_SHA:0:12}
systemd-run --unit="$RTG_STAGE" --collect \
  --property=Type=exec --property=DynamicUser=yes \
  --property="WorkingDirectory=$RTG_RELEASE" \
  --property="StateDirectory=$RTG_STAGE" --property=StateDirectoryMode=0750 \
  --property=EnvironmentFile=/etc/readytogo/readytogo.env \
  --property=NoNewPrivileges=yes --property=ProtectSystem=strict --property=ProtectHome=yes \
  --setenv=NODE_ENV=production --setenv=TZ=Asia/Shanghai \
  --setenv=HOST=127.0.0.1 --setenv=PORT=33001 \
  --setenv="CATALOG_PATH=/var/lib/$RTG_STAGE/catalog.json" \
  --setenv="MATCH_CACHE_PATH=/var/lib/$RTG_STAGE/matches.json" \
  /usr/bin/node "$RTG_RELEASE/dist/server/main.js"
ss -ltnp 'sport = :33001'
curl --fail --max-time 10 http://127.0.0.1:33001/health
curl --fail --max-time 10 http://127.0.0.1:33001/api/v1/data/summary
```

必须实际看到127.0.0.1监听；Type=exec只确认进程启动，不等于业务健康。首次导入期间做有界短间隔健康等待。

验证 `/health` 的 `status=ok/service=readytogo`、导入统计、首页及实际JS/CSS资源、一次真实地点→单站预览、当前模型parse、详情/导航、静态地图PNG。有`pendingWork`时用`batchCursor`读取当前批次，只有用户式加载下一页才用`nextCursor`。记录complete/fallback/partial和实际范围，不把首次200当作结果完成，不为变绿重复实模请求。

初始导入为13,124实体；运行时独立高德候选可能增加health里的catalogCount，正式导入基线以data/summary为准。测试结束后停止stage，保留无凭据证据，stage缓存不复制到正式状态。

## 4. 切换与公网验证

把unit模板安装到 `/etc/systemd/system/readytogo.service`。先保存旧current目标，然后创建临时symlink并用`mv -T`原子切换到已通过stage的新release；unit中的WorkingDirectory保证静态网页和CSV的相对路径正确。运行 `systemd-analyze verify /etc/systemd/system/readytogo.service`、`systemctl daemon-reload`。

首次切换：先stop smoke，再start readytogo；后续版本只restart readytogo。若启动或后续检查失败，立即走回滚。

```bash
systemctl stop readytogo-smoke.service
systemctl start readytogo.service
systemctl is-active readytogo.service
curl --fail --max-time 10 http://127.0.0.1:3000/health
```

本机再检查公网 `/health`、首页资产与有限业务API。验证新服务MainPID的`/proc/<pid>/cwd`等于release，服务器bundle与本机产物SHA一致。旧smoke使用`/healthz`和`service=readytogo-smoke`，不作为新应用成功证据。

全部成功后enable readytogo；首次发布disable smoke。保留smoke文件，记录新服务active/enabled、smoke inactive/disabled、80/8080仍归原服务、实际release和产物摘要。当前验收不执行被工具拒绝的实际应用浏览器，不绕过拒绝；真实手机条件单独记录为未满足。

## 5. 回滚与排查

首次发布退回smoke：

```bash
systemctl disable --now readytogo.service
systemctl enable --now readytogo-smoke.service
curl --fail --max-time 10 http://127.0.0.1:3000/healthz
```

本机也检查公网 `/healthz` 必须为 `service=readytogo-smoke/ok=true`。如果曾修改smoke文件或unit，则恢复记录的备份并daemon-reload再启动。保留失败release和日志，不删除证据。

后续正式版本回滚：stop readytogo，恢复previous current、旧unit和必要配置/状态，daemon-reload并启动，重新验证新应用`/health`及业务API。不要把首次smoke回滚步骤当作所有后续发布的默认。

日志使用 `journalctl -u readytogo.service`；现有HTTP日志仅含请求ID、路由模板、耗时和错误码。不要输出进程环境或原始供应商请求。服务健康但高德/千问失败时，检查配置键的存在性、供应商安全错误码及权限/配额；不要对外暴露key。

回滚文档已准备不等于回滚演练通过，实际执行结果必须写入发布记录。域名、TLS、防火墙和其他服务不在本次变更范围。
