# 实际发布记录

当前公网演示：[ReadytoGo](http://47.85.138.198:3000/)。正式服务 active/running/enabled，smoke inactive/disabled；以[服务状态证据](evidence/service-state.json)中的观测时间为准，不把有限检查当作持续可用承诺。

## 已发布版本

| 项目        | 实际值                                                                               |
| ----------- | ------------------------------------------------------------------------------------ |
| 运行代码    | `c82770b6be6d70e3da20a81cdd0d1f196841c008`，包括通用HOST与原文上下文修复             |
| release     | `/opt/readytogo/releases/c82770b6be6d70e3da20a81cdd0d1f196841c008`                   |
| current     | `/opt/readytogo/current`，指向上述release；实际MainPID cwd一致                       |
| 服务 / 端口 | `readytogo.service` / `0.0.0.0:3000`，启用开机启动                                   |
| 正式状态    | `/var/lib/readytogo/catalog.json`、`matches.json`，文件0640，systemd DynamicUser所有 |
| 凭据        | `/etc/readytogo/readytogo.env`，root:root/0600，仅四个必要运行值                     |
| smoke备份   | `/opt/readytogo/backups/smoke-before-1c3a84d5cd87`，旧site和unit保留                 |
| 服务器      | Linux x86_64，Node24.15.0/npm11.12.1；Linux锁文件安装76个生产包                      |
| 首次切换    | UTC 2026-10-08 20:46:48；北京时间2026-10-09 04:46:48                                 |
| 回滚后恢复  | UTC 2026-10-08 20:47:58；北京时间2026-10-09 04:47:58                                 |

运行产物对应上面的确定代码提交；后续用于补录证据和审查结果的文档提交不改变运行包。归档SHA256 `b7a2119eb96d4e285ec5e05ffe6b72c7a1d7118eff2304bea60e8c8fce76c70c`，服务器bundle SHA256 `e50372938d8ea9160ef09ed79605b25f51f2afc4ebc41e31b76e392aa88b1e58`。完整七文件摘要见[manifest](evidence/release-manifest.json)，检查概况见[release-summary](evidence/release-summary.json)。

80仍由forme-footwear原进程提供服务，8080仍由sub2api的docker-proxy提供服务；对应PID与预检相同。没有更改这些项目、DNS、HTTPS、防火墙或安全组。33001已停止stage监听。公开HTTP的定位限制保持手选降级。

## 发布检查和回滚实演

| 检查               | 结果与边界                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 修复后回环stage    | 新release实际监听127.0.0.1:33001；manifest七项与本机一致；健康、正式导入、页面与资产通过                             |
| 唯一必要解析复验   | 2846ms complete；陶然亭地点和明确否定坐便的any正确；所有项noteKind=source_context且note逐字等于原输入                |
| stage单站预览      | 21058ms，首批10候选路线success、AI complete，hasMore=true                                                            |
| 本机到公网真实HTTP | 首页/JS/CSS摘要匹配；陶然亭查询和单站首批10路线成功，AI complete，24143ms；详情ID、导航路线及640×480 PNG通过         |
| 公网重复解析       | 未执行；复用同一运行代码的stage解析证据，public记录明确标skip                                                        |
| 回滚到smoke        | UTC20:47:42公网/healthz真实返回service=readytogo-smoke、ok=true                                                      |
| 恢复正式服务       | UTC20:47:58公网/health返回readytogo/ok；三项前端资产SHA一致；原canonical厕所位置及北京台账+高德来源由cache恢复       |
| 最终服务状态       | ReadytoGo服务active/running/enabled，smoke inactive/disabled；进程cwd和bundle摘要对应本次release；凭据0600、状态0640 |

原“After lunch”漏备注不被删去。修复复验明确证明的是**软件保留完整原文上下文**，并不宣称模型理解了时间范围或把时间正确分配给每站。纯地点列表保持空备注和跨站上下文等行为由HTTP/组件回归检查。解析与预览使用独立的发布验证设置，没有修改真实用户的保存行程。

证据分别见[修复后stage](evidence/stage-after-context-fix.json)、[公网HTTP](evidence/public-http.json)、[smoke回滚](evidence/rollback-smoke.json)、[恢复正式服务](evidence/restored-http.json)。请求ID和实际耗时保留，省略精确坐标及供应商原始资料。第一次启动health为13,124，恢复cache后为13,148，后者包含新增独立高德候选；正式CSV导入仍是13,124实体。

这些是HTTP、进程、持久文件及部署检查。未执行实际应用浏览器预览或真实手机操作，规格第61项及阶段5真机退出条件仍未通过。最终整分支双轴review由集成流程继续完成。

## 首次预发布与发现

2026-10-09 04:21（UTC 2026-10-08T20:21），提交 `1c3a84d5cd87dd6c5908ce0a08d9f2b20cd354c3` 已在服务器回环stage启动。

- release：`/opt/readytogo/releases/1c3a84d5cd87dd6c5908ce0a08d9f2b20cd354c3`。
- Linux Node24.15.0/npm11.12.1，`npm ci --omit=dev --no-audit --no-fund` 安装76个生产包。归档SHA256与7个manifest文件逐项匹配。
- stage服务 `readytogo-stage-1c3a84d5cd87.service` 实际监听127.0.0.1:33001，独立StateDirectory；catalogue和matches均已写入。启动时MemoryCurrent约284MiB。
- root-only环境文件包含四个运行值，文件root:root/0600；运行允许清单扫描未含当前API secret值。没有上传本机node_modules或.env。
- 新unit安装但inactive/disabled；systemd-analyze verify退出0。宿主既有snapd的RestartMode警告与本unit无关，未改动该服务。
- 原smoke备份：`/opt/readytogo/backups/smoke-before-1c3a84d5cd87`，包括site目录和unit。

首次stage HTTP见[原记录](evidence/stage-before-note-fix.json)。健康、导入、JS/CSS、陶然亭地点查询、首批10条路线、AI分析、详情ID、导航数值和640×480 PNG通过。单站预览23,933ms、AI complete；hasMore=true，仅首批。

**该次解析语义未全部通过**：输入 `After lunch visit Taoranting Park. I do not need a seated toilet.` 得到正确地点与 `any`，但 `note=null`，漏掉“After lunch”。HTTP200和status=complete没有被当作语义完整证据。阶段审查决定先做通用备注保留修复，未为该短语添加特例；当时公网仍由smoke提供服务，未提前切换。

旧失败记录保持原样，后续复验与正式发布结果见上文。实际应用浏览器和真机限制见[交付验收](acceptance.md)。
