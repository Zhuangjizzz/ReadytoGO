import { useEffect, useRef, useState } from "react";
import type { Place } from "../shared/contracts";
import type { LocalPlanController } from "./useLocalPlan";
import { useItineraryDraft } from "./useItineraryDraft";
import { newClientId } from "./clientId";
import { PlacePicker } from "./PlacePicker";
import { PlanConfirm } from "./PlanConfirm";
import { samePlace } from "../shared/plan";

export function AiPlanInput({
  controller,
  active,
  onConfirmed,
}: {
  controller: LocalPlanController;
  active: boolean;
  onConfirmed: () => void;
}) {
  const { plan } = controller;
  const zh = plan.language === "zh-CN";
  const draft = useItineraryDraft({
    language: plan.language,
    preference: plan.preference,
    revision: plan.revision,
    active,
  });
  const [picker, setPicker] = useState<string | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const savedEpoch = useRef(controller.cacheEpoch);
  useEffect(() => {
    if (savedEpoch.current === controller.cacheEpoch) return;
    savedEpoch.current = controller.cacheEpoch;
    draft.discard();
    draft.editText("");
    setPicker(null);
    setDuplicateConfirm(false);
    setConfirmError(false);
  }, [controller.cacheEpoch]);
  const proposal = draft.draft;
  const changed = proposal && proposal.sourceText !== draft.text;
  const canConfirm =
    !!proposal &&
    !changed &&
    !draft.busy &&
    proposal.rows.length >= 1 &&
    proposal.rows.length <= 10 &&
    proposal.rows.every((row) => row.selected);
  const selectedPlaces =
    proposal?.rows.flatMap((row) => (row.selected ? [row.selected] : [])) ?? [];
  const repeated = selectedPlaces.some((place, index) =>
    selectedPlaces
      .slice(0, index)
      .some((previous) => samePlace(previous, place)),
  );
  function apply() {
    if (!canConfirm || !proposal) return;
    try {
      controller.replaceStops(
        proposal.rows.map((row) => ({
          stopId: newClientId("stop"),
          place: row.selected!,
          ...(row.note ? { note: row.note } : {}),
          ...(row.note && row.noteKind ? { noteKind: row.noteKind } : {}),
        })),
        proposal.preference ?? undefined,
      );
      draft.discard();
      setDuplicateConfirm(false);
      setConfirmError(false);
      onConfirmed();
    } catch {
      setConfirmError(true);
      setDuplicateConfirm(false);
    }
  }
  const pickRow = proposal?.rows.find((row) => row.id === picker);
  function selectPlace(place: Place) {
    if (picker) draft.choose(picker, place);
    setPicker(null);
  }
  return (
    <section
      className="ai-plan-input"
      hidden={!active}
      aria-label={zh ? "AI 行程辅助" : "AI itinerary assistant"}
    >
      <div className="eyebrow">{zh ? "AI 辅助填入" : "AI ASSISTED INPUT"}</div>
      <h2>{zh ? "已有旅行安排？" : "Already have an itinerary?"}</h2>
      <p>
        {zh
          ? "粘贴中英文行程，核对真实地点后再替换当前计划。也可以继续使用手动添加。"
          : "Paste a Chinese or English itinerary, then review real map matches before replacing your plan. You can also add stops manually."}
      </p>
      <label className="field-label" htmlFor="itinerary-text">
        {zh ? "你的行程文本" : "Your itinerary"}
      </label>
      <textarea
        id="itinerary-text"
        rows={4}
        value={draft.text}
        onChange={(event) => draft.editText(event.target.value)}
        placeholder={
          zh
            ? "按顺序写下地点、可选时间备注和厕所需求。"
            : "Places in order, optional time notes, and any toilet preference."
        }
      />
      <div className="ai-input-footer">
        <span className={draft.text.length > 2000 ? "error" : "muted"}>
          {draft.text.length} / 2000
        </span>
        <button
          className="primary"
          disabled={
            !draft.text.trim() || draft.text.length > 2000 || draft.busy
          }
          onClick={() => void draft.parse()}
        >
          {draft.busy
            ? zh
              ? "正在理解行程…"
              : "Reading your itinerary…"
            : zh
              ? "用 AI 填入景点"
              : "Use AI to fill stops"}
        </button>
      </div>
      {draft.text.length > 2000 && (
        <p className="notice" role="alert">
          {zh
            ? "请将输入缩短至 2,000 字符以内，原文仍保留。"
            : "Shorten the text to 2,000 characters. Your input is kept."}
        </p>
      )}
      {draft.message && (
        <p className="notice" role="status">
          {draft.message === "changed"
            ? zh
              ? "条件已改变，请重新解析；原文和草稿仍保留。"
              : "Conditions changed. Run AI again; your text and draft are kept."
            : zh
              ? "AI 暂不可用，已保留原文、草稿和当前行程。可重试或手动编辑。"
              : "AI is temporarily unavailable. Your text, draft and current plan are kept. Retry or edit manually."}
        </p>
      )}
      {proposal && (
        <div className="ai-proposal">
          <h3>
            {zh ? "核对待确认行程" : "Review your draft"}{" "}
            <span className="muted">{proposal.rows.length} / 10</span>
          </h3>
          <p className="fine-print">
            {zh
              ? "确认前不会修改当前行程。时间仅作为备注，不计算到达时间。"
              : "Your current plan stays unchanged until you confirm. Times are notes; arrival times are not calculated."}
          </p>
          {changed && (
            <div className="notice">
              <p>
                {zh
                  ? "原文已修改，可重新解析，或手动核对草稿后继续。确认后才会替换当前行程。"
                  : "The text has changed. Run AI again or review the draft manually. Your plan is replaced only after confirmation."}
              </p>
              <button className="secondary" onClick={draft.useManualDraft}>
                {zh
                  ? "将修订草稿用于当前文本"
                  : "Use edited draft for this text"}
              </button>
              <p className="fine-print">
                {zh
                  ? "手动接续会保留已选地点与备注，需求恢复为沿用当前选择。"
                  : "Continuing manually keeps the selected places and notes and resets the proposed preference to your current choice."}
              </p>
            </div>
          )}
          {proposal.manual && (
            <p className="notice">
              {zh
                ? "这是手动核对的草稿。只使用你选择的需求，其他需求不会自动提取。"
                : "Manually reviewed draft. Only your selected preference applies; other needs are not automatically extracted."}
            </p>
          )}
          {proposal.rows.length > 10 && (
            <p className="notice">
              {zh
                ? "已保留所有地点，请删减至最多 10 站后统一匹配。"
                : "All places are kept. Remove stops to keep at most 10 before matching them together."}
            </p>
          )}
          {proposal.unsupportedNeeds.length > 0 && (
            <div className="notice">
              <strong>
                {zh
                  ? "目前不支持专门筛选的需求"
                  : "Needs without dedicated filters"}
              </strong>
              <ul>
                {proposal.unsupportedNeeds.map((need, index) => (
                  <li key={index}>{need}</li>
                ))}
              </ul>
            </div>
          )}
          {proposal.warnings.length > 0 && (
            <ul className="notice">
              {proposal.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          )}
          <label className="field-label" htmlFor="proposal-preference">
            {zh ? "确认后使用的厕所需求" : "Toilet preference to apply"}
          </label>
          <select
            id="proposal-preference"
            value={proposal.preference ?? "keep"}
            onChange={(event) =>
              draft.setPreference(
                event.target.value === "keep"
                  ? null
                  : (event.target.value as "any" | "seated_required"),
              )
            }
          >
            <option value="keep">
              {zh ? "沿用当前选择" : "Keep my current preference"}
            </option>
            <option value="any">{zh ? "无特殊要求" : "No preference"}</option>
            <option value="seated_required">
              {zh ? "需要坐便" : "Seated toilet needed"}
            </option>
          </select>
          {!proposal.rows.length && (
            <p className="notice">
              {zh
                ? "未识别出景点，可修改原文或手动添加草稿地点。"
                : "No places were identified. Edit the text or add a draft place manually."}
            </p>
          )}
          {proposal.rows.map((row, index) => (
            <section
              className="ai-draft-stop"
              key={row.id}
              aria-label={`${zh ? "草稿第 " : "Draft stop "}${index + 1}${zh ? " 站" : ""}`}
            >
              <div className="ai-stop-heading">
                <span className="stop-number">{index + 1}</span>
                <div>
                  {row.originalText && (
                    <p className="original-fragment">{row.originalText}</p>
                  )}
                  <span className="fine-print">
                    {zh
                      ? "选择具体入口或地点"
                      : "Choose a specific place or entrance"}
                  </span>
                </div>
                <div className="stop-tools">
                  <button
                    className="icon-button"
                    aria-label={zh ? "草稿上移" : "Move draft stop up"}
                    disabled={index === 0}
                    onClick={() => draft.move(row.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="icon-button"
                    aria-label={zh ? "草稿下移" : "Move draft stop down"}
                    disabled={index === proposal.rows.length - 1}
                    onClick={() => draft.move(row.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="icon-button"
                    aria-label={zh ? "删除草稿地点" : "Remove draft stop"}
                    onClick={() => draft.remove(row.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <form
                className="ai-place-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  draft.lookup(row.id);
                }}
              >
                <label className="sr-only" htmlFor={`query-${row.id}`}>
                  {zh
                    ? `第 ${index + 1} 站检索词`
                    : `Search name for stop ${index + 1}`}
                </label>
                <input
                  id={`query-${row.id}`}
                  value={row.query}
                  maxLength={120}
                  onChange={(event) =>
                    draft.editQuery(row.id, event.target.value)
                  }
                />
                <button
                  className="secondary"
                  disabled={!row.query.trim() || row.status === "loading"}
                >
                  {row.status === "loading"
                    ? zh
                      ? "匹配中…"
                      : "Matching…"
                    : zh
                      ? "搜索候选"
                      : "Search matches"}
                </button>
              </form>
              {row.selected && (
                <p className="selection-label">
                  {zh ? "已选地点" : "Selected place"}: {row.selected.nameZh} ·{" "}
                  {row.selected.district} · {row.selected.addressZh}
                </p>
              )}
              {row.status === "error" && (
                <p className="notice" role="status">
                  {zh
                    ? "地点查询暂不可用，可重试搜索或手动选点。"
                    : "Place search is unavailable. Retry or choose a point manually."}
                </p>
              )}
              {row.status === "complete" &&
                !row.candidates.length &&
                !row.selected && (
                  <p className="notice">
                    {zh
                      ? "没有找到匹配地点，请修改检索词或手动选点。"
                      : "No matching places. Edit the search name or choose a point manually."}
                  </p>
                )}
              {row.candidates.length > 0 && !row.selected && (
                <ul className="ai-place-candidates">
                  {row.candidates.map((place, index) => (
                    <li key={place.poiId ?? index}>
                      <button
                        onClick={() => draft.choose(row.id, place)}
                        aria-label={`${zh ? "使用" : "Use"} ${place.nameZh} ${place.district} ${place.addressZh}`}
                      >
                        <strong>{place.nameZh}</strong>
                        <span>
                          {place.district} · {place.addressZh || place.city}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {row.hasMore && !row.selected && (
                <p className="fine-print">
                  {zh
                    ? "还有其他结果，可用更具体的名称或入口缩小范围。"
                    : "More results exist. Use a more specific name or entrance to narrow the search."}
                </p>
              )}
              <button
                className="text-link"
                onClick={() => {
                  draft.interruptParse();
                  setPicker(row.id);
                }}
              >
                {zh ? "更换地点 / 地图选点" : "Change place / choose on map"}
              </button>
              <label className="field-label" htmlFor={`note-${row.id}`}>
                {zh ? `第 ${index + 1} 站备注` : `Notes for stop ${index + 1}`}
              </label>
              {row.noteKind === "source_context" && (
                <p className="fine-print">
                  {zh
                    ? "原文上下文，可能包含多站，请核对"
                    : "Original context may cover multiple stops. Please check."}
                </p>
              )}
              <textarea
                id={`note-${row.id}`}
                value={row.note}
                rows={3}
                maxLength={2000}
                onChange={(event) => draft.editNote(row.id, event.target.value)}
              />
            </section>
          ))}
          {repeated && (
            <p className="notice">
              {zh
                ? "包含重复地点，可保留重复游览或删除多余站点。"
                : "This draft contains repeated places. Keep return visits or remove extra stops."}
            </p>
          )}
          {confirmError && (
            <p className="notice" role="alert">
              {zh
                ? "请为每站选择有效的北京地点后重试。"
                : "Choose a valid Beijing place for every stop, then try again."}
            </p>
          )}
          <div className="plan-actions">
            <button className="secondary" onClick={draft.add}>
              {zh ? "添加草稿地点" : "Add a draft place"}
            </button>
            <button
              className="secondary"
              disabled={
                proposal.rows.length > 10 ||
                changed ||
                proposal.rows.every((row) => row.selected || !row.query.trim())
              }
              onClick={() => void draft.searchUnresolved()}
            >
              {zh ? "匹配未选择的地点" : "Match unresolved places"}
            </button>
            <button className="text-link" onClick={draft.discard}>
              {zh ? "保留当前行程" : "Keep current plan"}
            </button>
            <button
              className="primary"
              disabled={!canConfirm}
              onClick={() => (repeated ? setDuplicateConfirm(true) : apply())}
            >
              {zh ? "确认并替换当前行程" : "Confirm and replace my plan"}
            </button>
          </div>
        </div>
      )}
      {active && pickRow && (
        <PlacePicker
          key={pickRow.id}
          language={plan.language}
          initialQuery={pickRow.query}
          initialPosition={pickRow.selected?.position}
          allowGeolocation={false}
          onSelect={selectPlace}
          onClose={() => setPicker(null)}
        />
      )}
      {active && duplicateConfirm && (
        <PlanConfirm
          title={zh ? "保留重复游览？" : "Keep repeated visits?"}
          onCancel={() => setDuplicateConfirm(false)}
        >
          <p>
            {zh
              ? "每次游览都会保留为独立站点，顺序不会改变。"
              : "Each visit will remain a separate stop in your chosen order."}
          </p>
          <div className="plan-actions">
            <button
              className="secondary"
              onClick={() => setDuplicateConfirm(false)}
            >
              {zh ? "继续编辑" : "Keep editing"}
            </button>
            <button className="primary" onClick={apply}>
              {zh ? "保留重复站并确认" : "Keep repeated visits and confirm"}
            </button>
          </div>
        </PlanConfirm>
      )}
    </section>
  );
}
