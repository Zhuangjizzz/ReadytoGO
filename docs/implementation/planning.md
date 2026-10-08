# 逐站规划与本机状态

实现入口是 `src/client/PlanPage.tsx`，接口位于 `src/server/routes/plans.ts`。规划复用已有目录、供应商队列、路线缓存、规则与 AI 候选分析，不为每站建立独立服务。

## 预览接口

`POST /api/v1/plans/preview` 接收：

```ts
{
  revision: number;
  language: "en" | "zh-CN";
  preference: "any" | "seated_required";
  includeConditionalAccess: boolean;
  walkLimitMinutes: 10 | 20;
  extendedRadiusKm: 5 | 10;
  stops: { stopId: string; place: Place; cursor?: string | null; retry?: boolean }[];
}
```

每次可提交 1–10 站，`stopId` 必须唯一，但地点及厕所允许重复。地点是已选定的 POI 或经行政区校验的手选地图位置，GPS 不作为保存的景点。界面按站提交，因此某站等待/失败时其他站可先显示，重试也只针对该站。

成功封装中的 `data` 包含 `revision`、整体 `status=complete/partial` 以及 `stops[]`。每站包含 `stopId`、`result`、`primary`、`alternatives`、`error` 和 `warnings`：

- `result` 是共用查询的 `SearchResult`，上下文固定为 `plan_stop`。空结果与请求失败分别为正常 `result.status=empty` 和 `result=null/error`。
- `primary` 只取 `matched` 第一项，最多两个初始备选从其余 `matched` 和 `farther` 获取。普通设施未知候选仍由完整列表中的主动展开入口提供。
- `batchCursor` 继续读当前批次；`nextCursor` 只在用户加载更多时提交。只有 `pendingWork=true` 自动补拉；终态部分结果由用户重试。
- 每站查询条件、供应商并发和缓存语义沿用共用查询，`revision` 不参与服务端算路缓存键。北京范围、输入结构及数量错误使用既有 HTTP 错误封装。

## 客户端状态

`useLocalPlan` 是语言、需求、进入条件、范围、站点及选择的唯一持久状态所有者。附近页通过受控设置与它共享条件。`usePlanResults` 单独管理每站结果，键包含 stopId、地点位置及有效查询条件；数组顺序与用户选择不属于计算键。

每次编辑提升 revision。重排时保留结果及批次游标，并以新 revision 接续仍在加载的站点；旧响应必须同时通过 revision、计算键和清除代次检查才能写回。换位置只刷新该站；需求、进入条件或语言变化更新相关查询。离开规划暂停客户端等待，回来继续未完成批次；失败或等待超时后须显式重试。当前会话的结果缓存期限为 15 分钟，刷新后重新查询。

默认主推荐不写入用户选择。`selectedToiletId` 只来自明确选择，`skipped` 只控制厕所安排；异步路线及 AI 分析不会改它们。查询条件改变后暂缺首批的旧选择保留，等待后续结果或提示重新选择，不展示旧条件的路线数字。原 Amap ID 与 canonical ID 通过候选来源中的 `poiId` 关联；迁移只在当前选择仍等于原 ID 时写入。不同站可选择同一厕所。

## 保存与清除

本机键为 `readytogo-plan`，数据遵循 `PlanLocal.schemaVersion=1`。读取时兼容既有独立语言、需求、进入条件键；首次变更后合并到一份当前行程，语言另留 `readytogo-language` 以便清除后保留。

写入前验证并提取允许的字段；只有手选 POI/地图位置可保存，浏览器 GPS 在 App 会话中使用。用户清除时同时清空行程、选择、跳过与结果缓存，并使在途结果失效。未知版本、损坏数据或存储异常均提示重建/当前会话保存，页面继续可用。

## 工单 06 接入点

- `PlanPage` 负责编辑/结果两个页面，`LocalPlanController.replaceStops(stops, preference?)` 原子替换确认后的 1–10 站并清除旧结果。未传 preference 时保留确认时的当前选择。
- AI 提案应独立保存，确认前不得调用 `updateStops`/`replaceStops`。每个地点先通过 `/places/search` 或 PlacePicker 取得真实 Place。
- `newClientId(prefix)` 为新站点或 AI 草稿生成 ID，支持缺少安全上下文 `randomUUID()` 的公网 HTTP 浏览器。
- `PlacePicker` 增加 `allowGeolocation`；规划使用 false。详情/导航回调需要同时传当前站的计算起点，App 已保持列表返回路径及分析语言。

## 验证

`tests/plan-preview.test.ts` 通过实际 HTTP 边界覆盖数量与身份、周期开放、重排前后路线复用和单站失败。`tests/dom/plan.test.tsx` 通过隔离 JSDOM 与 HTTP 边界响应验证编辑恢复、异步保护、共享设置、ID 回退、存储错误、canonical 选择、清除、替换/重试与 GPS 不落盘。

没有访问被拒绝的实际应用浏览器入口；这些验证不等同于实际手机或最终页面视觉验收。
