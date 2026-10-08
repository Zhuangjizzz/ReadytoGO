# 实际发布记录

时间以UTC原值及Asia/Shanghai当地时间说明。本记录只记实际执行结果，不把准备步骤当成正式部署成功。

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

正式发布及回滚将在后续实际执行后追加。实际应用浏览器和真机限制见[交付验收](acceptance.md)。
