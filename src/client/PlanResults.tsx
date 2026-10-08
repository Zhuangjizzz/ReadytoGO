import { useEffect, useState } from "react";
import type {
  Candidate,
  CandidateGroups,
  Origin,
  PlanStop,
} from "../shared/contracts";
import { placeOrigin, planRecommendations, sameToilet } from "../shared/plan";
import type { LocalPlanController } from "./useLocalPlan";
import type { usePlanResults } from "./usePlanResults";
import { ToiletCard } from "./ToiletCard";
const labels: Record<keyof CandidateGroups, [string, string]> = {
  matched: ["Within your walking time", "所选步行范围内"],
  farther: ["Beyond your walking time", "超出所选步行范围"],
  otherNearby: ["Other nearby toilets", "其他附近厕所"],
  conditionalAccess: ["Ticket or purchase required", "需门票或消费"],
  routeUnknown: ["Walking time unavailable", "步行时间暂不可用"],
};
export interface PlanActions {
  onDetails: (candidate: Candidate, origin: Origin) => void;
  onNavigate: (candidate: Candidate, origin: Origin) => void;
  onNearby: () => void;
}
export function PlanResults({
  controller,
  results,
  onEdit,
  onDetails,
  onNavigate,
  onNearby,
}: {
  controller: LocalPlanController;
  results: ReturnType<typeof usePlanResults>;
  onEdit: () => void;
} & PlanActions) {
  const { plan, updateStops } = controller;
  const zh = plan.language === "zh-CN";
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    const changes = new Map<string, { from: string; to: string }>();
    for (const stop of plan.stops) {
      if (!stop.selectedToiletId) continue;
      const result = results.forStop(stop)?.result;
      const candidate =
        result &&
        Object.values(result.groups)
          .flat()
          .find((c) => sameToilet(c, stop.selectedToiletId!));
      if (candidate && candidate.toiletId !== stop.selectedToiletId)
        changes.set(stop.stopId, {
          from: stop.selectedToiletId,
          to: candidate.toiletId,
        });
    }
    if (changes.size)
      updateStops((stops) =>
        stops.map((stop) => {
          const change = changes.get(stop.stopId);
          return change && stop.selectedToiletId === change.from
            ? { ...stop, selectedToiletId: change.to }
            : stop;
        }),
      );
  });
  const choose = (stop: PlanStop, candidate: Candidate) => {
    updateStops((stops) =>
      stops.map((s) =>
        s.stopId === stop.stopId
          ? { ...s, selectedToiletId: candidate.toiletId, skipped: false }
          : s,
      ),
    );
    setExpanded(null);
  };
  function card(stop: PlanStop, candidate: Candidate) {
    return (
      <div
        className="plan-candidate"
        role="group"
        aria-label={candidate.nameZh}
        key={candidate.toiletId}
      >
        <ToiletCard
          candidate={candidate}
          language={plan.language}
          selected={
            !!stop.selectedToiletId &&
            sameToilet(candidate, stop.selectedToiletId)
          }
          onDetails={() => onDetails(candidate, placeOrigin(stop.place))}
          onNavigate={() => onNavigate(candidate, placeOrigin(stop.place))}
        />
        <button
          className="secondary choose-toilet"
          disabled={
            !plan.includeConditionalAccess &&
            (candidate.accessCondition === "ticket_required" ||
              candidate.accessCondition === "purchase_required")
          }
          onClick={() => choose(stop, candidate)}
        >
          {zh ? "选择此厕所" : "Choose this toilet"}
        </button>
      </div>
    );
  }
  return (
    <section className="plan-results">
      <div className="plan-actions">
        <button className="secondary" onClick={onEdit}>
          {zh ? "编辑行程" : "Edit stops"}
        </button>
      </div>
      {!plan.stops.length && (
        <p className="notice">
          {zh ? "先添加 1–10 个景点。" : "Add 1–10 stops to start your plan."}
        </p>
      )}
      {plan.stops.map((stop, index) => {
        const state = results.forStop(stop);
        const result = state?.result;
        const all = result ? Object.values(result.groups).flat() : [];
        const found = stop.selectedToiletId
          ? all.find((c) => sameToilet(c, stop.selectedToiletId!))
          : undefined;
        const choice =
          found &&
          (!plan.includeConditionalAccess &&
          (found.accessCondition === "ticket_required" ||
            found.accessCondition === "purchase_required")
            ? undefined
            : found);
        const { primary, alternatives } = result
          ? planRecommendations(result.groups)
          : { primary: null, alternatives: [] };
        const initial = [...(primary ? [primary] : []), ...alternatives];
        const cards = choice
          ? [
              choice,
              ...initial.filter((c) => c.toiletId !== choice.toiletId),
            ].slice(0, 3)
          : initial;
        const isExpanded = expanded === stop.stopId;
        return (
          <section
            className="plan-stop-result"
            data-stop-id={stop.stopId}
            key={stop.stopId}
            aria-label={`${zh ? "第" : "Stop "}${index + 1}${zh ? "站" : ""}`}
          >
            <div className="plan-stop-title">
              <span className="stop-number">{index + 1}</span>
              <div>
                <h2>
                  {!zh && stop.place.nameEn
                    ? stop.place.nameEn
                    : stop.place.nameZh}
                </h2>
                <p>
                  {stop.place.nameZh} · {stop.place.district} ·{" "}
                  {stop.place.addressZh}
                </p>
                <p className="muted">
                  {zh ? "从所选景点出发" : "From your selected attraction"} ·{" "}
                  {plan.preference === "seated_required"
                    ? zh
                      ? "需要坐便"
                      : "Seated toilet needed"
                    : zh
                      ? "无特殊要求"
                      : "No preference"}
                </p>
                {stop.note && <p>{stop.note}</p>}
              </div>
            </div>
            {stop.skipped ? (
              <div className="notice">
                {zh
                  ? "已跳过本站如厕安排，景点仍保留。"
                  : "Toilet arrangement skipped. Your attraction stays in the itinerary."}{" "}
                <button
                  className="text-link"
                  onClick={() =>
                    updateStops((stops) =>
                      stops.map((s) =>
                        s.stopId === stop.stopId ? { ...s, skipped: false } : s,
                      ),
                    )
                  }
                >
                  {zh ? "恢复安排" : "Restore arrangement"}
                </button>
              </div>
            ) : (
              <>
                {(!state || state.loading) && (
                  <p className="notice" role="status">
                    {zh
                      ? "正在加载本站，其他站可先查看…"
                      : "Loading this stop. Other stops can be viewed first…"}
                  </p>
                )}
                {state?.error && (
                  <p className="notice error" role="alert">
                    {zh
                      ? "本站查询未完成，请重试。"
                      : "This stop could not finish. Please retry."}
                  </p>
                )}
                {result?.status === "partial" && !state?.loading && (
                  <p className="notice">
                    {zh
                      ? "部分资料或路线暂不可用，可重试本站。"
                      : "Some details or routes are unavailable. You can retry this stop."}
                  </p>
                )}
                {result?.analysisStatus === "fallback" && (
                  <p className="fine-print">
                    {zh
                      ? "AI 暂不可用，显示已有资料说明。"
                      : "AI is unavailable; descriptions use the available records."}
                  </p>
                )}
                {stop.selectedToiletId && !choice && (
                  <p className="notice">
                    {result &&
                    !result.pendingWork &&
                    !result.hasMore &&
                    !state?.error
                      ? zh
                        ? "原选择当前不符合条件或暂不可用，请重新选择。已保留该选择记录。"
                        : "Your saved choice is not available for the current conditions. Choose again; the choice record is kept."
                      : zh
                        ? "已保留你的选择，正在按当前条件重新检查。可加载更多或重新选择。"
                        : "Your choice is saved and awaiting a check against the current conditions. Load more or choose again."}
                  </p>
                )}
                {choice && (
                  <p className="selection-label">
                    {zh ? "你的选择" : "Your choice"}: {choice.nameZh}
                    {plan.preference === "seated_required" &&
                      !["inferred", "documented"].includes(
                        choice.seatStatus,
                      ) && (
                        <span>
                          {" "}
                          · {zh ? "暂无坐便线索" : "No seated-toilet clues"}
                        </span>
                      )}
                  </p>
                )}
                {result && !primary && !result.pendingWork && (
                  <p className="notice">
                    {all.length
                      ? zh
                        ? "本站没有范围内的主推荐，可查看更远或其他候选。"
                        : "No matching recommendation within your walking time. Explore farther or other options."
                      : zh
                        ? "当前范围没有候选。可扩大范围或更换景点。"
                        : "No candidates in this range. Expand the range or change this stop."}
                  </p>
                )}
                {!isExpanded ? (
                  <div className="plan-cards">
                    {cards.map((candidate) => (
                      <div key={candidate.toiletId}>
                        {candidate.toiletId === primary?.toiletId && (
                          <p className="group-heading">
                            {zh ? "符合条件的主推荐" : "Recommended option"}
                          </p>
                        )}
                        {card(stop, candidate)}
                      </div>
                    ))}
                  </div>
                ) : (
                  result && (
                    <div className="plan-all-options">
                      {(Object.keys(labels) as (keyof CandidateGroups)[])
                        .filter((group) => group !== "otherNearby")
                        .map((group) => {
                          const list = result.groups[group].filter(
                            (c) => !c.ordinaryAlternative,
                          );
                          return list.length ? (
                            <section key={group}>
                              <h3>{labels[group][zh ? 1 : 0]}</h3>
                              {list.map((c) => card(stop, c))}
                            </section>
                          ) : null;
                        })}
                      {(result.groups.otherNearby.length > 0 ||
                        all.some((c) => c.ordinaryAlternative)) && (
                        <details>
                          <summary>
                            {zh
                              ? "展开其他附近厕所"
                              : "Show other nearby toilets"}
                          </summary>
                          {all
                            .filter(
                              (c) =>
                                c.ordinaryAlternative ||
                                result.groups.otherNearby.includes(c),
                            )
                            .map((c) => card(stop, c))}
                        </details>
                      )}
                    </div>
                  )
                )}
                <div className="plan-actions">
                  <button
                    className="secondary"
                    onClick={() => setExpanded(isExpanded ? null : stop.stopId)}
                  >
                    {isExpanded
                      ? zh
                        ? "收起候选"
                        : "Close all options"
                      : zh
                        ? "换一个 / 全部候选"
                        : "Change / all options"}
                  </button>
                  <button
                    className="text-link"
                    onClick={() =>
                      updateStops((stops) =>
                        stops.map((s) =>
                          s.stopId === stop.stopId
                            ? { ...s, skipped: true }
                            : s,
                        ),
                      )
                    }
                  >
                    {zh ? "跳过如厕安排" : "Skip toilet arrangement"}
                  </button>
                  <button className="text-link" onClick={onNearby}>
                    {zh ? "从当前位置查找" : "Find from my current location"}
                  </button>
                </div>
                {(state?.error || result?.status === "partial") &&
                  !state?.loading && (
                    <button
                      className="secondary"
                      onClick={() => results.refreshStop(stop.stopId)}
                    >
                      {zh ? "重试本站" : "Retry this stop"}
                    </button>
                  )}
                {result?.hasMore && (
                  <button
                    className="secondary"
                    disabled={state?.loading}
                    onClick={() =>
                      results.refreshStop(stop.stopId, result.nextCursor)
                    }
                  >
                    {zh ? "加载更多候选" : "Load more candidates"}
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}
    </section>
  );
}
