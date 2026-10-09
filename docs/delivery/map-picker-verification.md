# 地图选点专项补验

日期：2026-10-09（Asia/Shanghai）。最后一次页面检查：11:06:05–11:06:22。

**地图手动选点已经在实际线上应用通过浏览器检查。** 首次交付记录中的 Browser Use 拒绝描述当时的验证限制，不能据此认定选点功能没有实现或不能使用。本次用户说明访问权限已开启并要求核查，使用当前可运行的 Playwright Chromium 访问线上应用；未检查原 Browser Use 的权限开关状态。

## 已验证的操作

路径：**找附近 → 选择起点 → 地图选点 → 轻触地图 → 确定此起点**。也可用方向按钮移动地图，再点击“选择地图中心”。窄屏弹层内容较长时向下滚动查看“确定此起点”。

| 场景 | 结果 |
| --- | --- |
| 390×844、触屏模拟 | 实际触点触发位置确认，返回北京地址，确认按钮启用，提交后附近页面显示同一起点 |
| 1280×900、桌面 | 真实底图加载、放大、向东平移、选择地图中心、确认起点均通过 |
| 数据与交互 | 地图返回 640×480 PNG，位置确认返回 200/GCJ02，点击坐标与确认位置一致；未选点时禁止确认 |
| 页面检查 | 两种尺寸均无弹层横向溢出，未捕获页面 JavaScript 异常 |
| 定位失败回退 | 公网 HTTP 页面 `isSecureContext=false`；“当前浏览器无法定位”提示出现时仍可完成手动选点 |

[完整结果](evidence/map-picker/verification-2026-10-09T03-06-05-803Z.json)；[触屏选点截图](evidence/map-picker/touch-390-picked.png)、[窄屏确认按钮](evidence/map-picker/touch-390-confirm-button.png)、[已确认起点](evidence/map-picker/touch-390-confirmed.png)、[桌面选点](evidence/map-picker/desktop-1280-picked.png)。图片使用公开北京演示点，不包含设备 GPS。页面 JS/CSS 摘要与 `2fafc9c` 的发布 manifest 一致。

本次实际运行完整产品页面，未替换网络响应或使用组件 fixture。最后一次检查共发出 4 个静态地图请求和 2 个位置确认请求；没有附近候选搜索或模型调用。计数是本次页面检查的 HTTP 请求数，不等同于供应商计费调用数，也不包含此前诊断。

手动复验命令（访问真实服务，默认测试不执行）：

```bash
node .scratch/map-picker-verification/verify.mjs
```

## 同时观察到的网络失败

首次补验的触屏流程已通过，但桌面放大时地图图片返回 503，见[原失败记录](evidence/map-picker/attempt-1.json)。用相同缩放级别单独请求公开图片接口仍得到 `MAP_UNAVAILABLE`，见[HTTP 复现](evidence/map-picker/zoom-http-probe.json)。因此该次失败可以脱离浏览器复现。

在部署服务器上，用现有凭据启动临时诊断进程，直接请求相同高德接口，观察到 `fetch` 的连接失败：一项 `ETIMEDOUT` 和两项 `ENETUNREACH`，总耗时约 302 ms。摘要只保存错误码，不能仅凭它确定各次连接的地址族；没有收到供应商鉴权或额度错误响应。请求和错误摘要见[诊断观测](evidence/map-picker/upstream-diagnostics.json)。

临时将 Node 的网络地址族单次连接尝试等待从 250 ms 调到 1000 ms 后，一次请求在 1759 ms 内返回正确 PNG；但随后使用原 250 ms 的独立请求也成功（1764 ms），见[原参数复验](evidence/map-picker/network-250.json)。最后页面复验保持线上原配置，也全部通过。

这些观测支持“服务器到高德的连接间歇失败”，不支持断言每个 503 都由某个固定参数导致，也不证明增加等待能彻底解决。`--network-family-autoselection-attempt-timeout=1000` 是已经单次试验的候选缓解参数，尚未加入正式服务；若继续处理稳定性，应先保留错误类型并做有界对照，再按部署流程应用和回滚。

当前遇到“地图暂不可用”可点“重试地图”，或切回“搜索地点”；若是“无法确认该位置”，可重新选点或搜索地点。无需因为这些服务失败反复修改浏览器权限。

## 验收范围

- 自动定位需要安全上下文及网站位置权限；当前公网 HTTP 的限制仍存在。手动选点使用地图点击位置，不依赖设备 GPS。
- 本次证明实际应用中的地图起点流程可用，不能据此标记列表与地图卡片联动、导航 App 交接、AI 全主线或所有视觉检查通过。
- 390×844 是桌面 Chromium 的触屏模拟，实际手机主线验收仍待完成。
- 本次没有修改生产代码、线上 unit、凭据、网络设置或重启服务；不会把后续恢复写成已经部署的修复。

官方依据：

- [MDN Geolocation API：安全上下文与位置权限](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)。
- [Node v24.15.0：网络地址族连接尝试超时](https://nodejs.org/download/release/v24.15.0/docs/api/net.html#netsetdefaultautoselectfamilyattempttimeoutvalue)。
- [Node v24.15.0：对应启动参数](https://nodejs.org/download/release/v24.15.0/docs/api/cli.html#--network-family-autoselection-attempt-timeout)。
