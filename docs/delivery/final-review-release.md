# 最终审查修复后的发布

后续验证：2026-10-09 11:06 已完成[线上地图起点专项浏览器检查](map-picker-verification.md)，并记录间歇图片503；没有重新发布或修改线上配置。下文“未满足的原验收”保留本次发布时的历史状态，实际手机验收仍未完成。

当前运行代码：`2fafc9c14934cccbde188a8613cf7ac8b85435e2`。公开地址：[ReadytoGo](http://47.85.138.198:3000/)。服务状态以 UTC 2026-10-08T21:31:01 的[末检记录](evidence/final-review/service-state.json)为准：ReadytoGo active/running/enabled，smoke inactive/disabled，33001不再监听；80/8080的既有进程与首次预检相同。

## 范围与版本

最终独立[Standards复核](../../.scratch/demo-development/reviews/final-standards-recheck.md)关闭共享分页合并的P3；[Spec复核](../../.scratch/demo-development/reviews/final-spec-recheck.md)关闭未开放状态、过滤后分页、切语言保留选择、重复同值操作中断四项P2，无新增工程发现。完整自动化 **120/120**，类型检查与构建通过。交付树构建的七个文件与集成分支构建逐项一致。

- release：`/opt/readytogo/releases/2fafc9c14934cccbde188a8613cf7ac8b85435e2`，`/opt/readytogo/current`指向它，实际进程cwd一致。
- 归档SHA256：`f0c73463be08224c9bd8d73bf04f2e842448ae7dc94cf6b32f8b5c84bb2443b6`。
- server bundle SHA256：`e8be4583cd6569bf7dcc59743b209a55515c899276000c73f15c2df5244cd088`。
- 新JS资产：`index-DPxUhsrL.js`；七文件完整摘要见[manifest](evidence/final-review/release-manifest.json)。
- Linux Node24.15.0/npm11.12.1，按锁文件安装76个生产依赖；未传本机node_modules或.env。
- 复用原unit、四项0600凭据和StateDirectory，未改配置或存储schema。运行代码之后的文档/证据提交不改变运行产物。

## 回环stage与真实服务边界

新stage真实监听127.0.0.1:33001，独立状态目录导入13,124实体。健康、首页、JS/CSS和七文件manifest核对通过。一个不调用供应商的[资料详情检查](evidence/final-review/source-closure.json)确认源记录 `bj_8cdd730ed449b80c314a`（东崔铸造厂公厕）从“未开放”得到 `out_of_service`，原备注保留。

| 尝试                                                                        | 实际结果                                                                                                                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [首个真实流程](evidence/final-review/stage-attempt-1.json)，UTC21:24:39开始 | 地点查询约5012ms后HTTP503/MAP_UNAVAILABLE；尚未进入preview，没有模型调用。服务/数据/资产已通过，整条技术检查为false。                          |
| 安全日志检查                                                                | 对应请求约5008ms，与配置的5秒等待上限一致；未观察到供应商infocode、鉴权/额度/限流或backoff信息。根因未被确定，不把时间吻合当作已证实网络原因。 |
| [一次有界重试](evidence/final-review/stage-retry-1.json)，UTC21:26:31开始   | 地点成功；首批10候选路线success、AI分析complete，预览22203ms，hasMore=true。技术检查通过。没有再增加重试、模型预算或提示词。                   |

本轮不重跑解析或六组holdout；parser和prompt相对`c82770b`未改，沿用其解析证据。脚本记录里的“same-code”指复用适用的解析实现证据，不表示本次整个应用代码未变化。`--skip-parse`路径没有发出`/assist/parse`请求。成功重试只处理一个首批查询窗口，轮询次数不等于模型请求次数；不声称穷尽所有候选。既有历史fallback与首次stage失败证据均未覆盖。

## 公网切换、业务版本回切与恢复

| 步骤                                                          | 真实证据                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [切换](evidence/final-review/cutover.json)                    | UTC21:28:23（北京时间2026-10-09 05:28:23）切换current并启动新版本；原版本为c82770b。 |
| [公网检查](evidence/final-review/public-assets.json)          | UTC21:28:28健康为readytogo/ok，index/JS/CSS全部匹配新manifest。                      |
| [回切旧业务版本](evidence/final-review/rollback-process.json) | 同一个readytogo.service回切c82770b，未切到smoke、未改unit/凭据/开机启动状态。        |
| [旧版公网检查](evidence/final-review/rollback-assets.json)    | UTC21:29:49健康与旧版三项资产SHA全部通过。                                           |
| [恢复新版](evidence/final-review/restore-process.json)        | UTC21:30:21恢复2fafc9c。                                                             |
| [新版公网复核](evidence/final-review/restored-assets.json)    | UTC21:30:30（北京时间2026-10-09 05:30:30）健康及新资产SHA全部通过。                  |

上述公网、回切、恢复只检查HTTP健康/资产及SSH进程/文件摘要，**新增地图/模型调用均为0**。没有重新演练smoke；首次smoke实演记录仍保留在[历史发布记录](deployment-record.md)。

备份目录为`/opt/readytogo/backups/before-2fafc9c14934`，保存旧current目标、unit和停止服务时的状态快照。StateDirectory是symlink，已用`cp -aL`解引用形成独立快照，未只复制一个指向活动目录的链接。缓存格式未改变，回切时保留兼容状态，没有无必要地回退数据。当前health的13,148包括已有独立高德候选，正式CSV导入基线仍为13,124。

发布末检发现tar保留了本机数字UID/GID（501:50）。已只对本项目新旧两个业务release执行不跟随symlink目标的所有权规范，现为root:root；七项文件及两个server bundle的字节摘要保持一致，凭据与StateDirectory所有权没有修改。[部署流程](../deployment/deployment.md)补充`tar --no-same-owner`，后续解包不再继承本机UID/GID。

## 未满足的原验收

整分支两轴工程整改已关闭，发布与回切检查通过。实际应用Browser Use拒绝仍被遵守，没有换浏览器、端口或CDP预览；实际手机浏览器主线、窄屏及导航降级没有执行。**规格第61项和阶段5真机退出条件仍未通过**，不能用本轮HTTP、构建或离线组件回归替代。
