import { useEffect, useState } from "react";
import type { Place } from "../shared/contracts";
import type { LocalPlanController } from "./useLocalPlan";
import { PlacePicker } from "./PlacePicker";
import { PlanSettings } from "./PlanSettings";
import { PlanResults, type PlanActions } from "./PlanResults";
import { usePlanResults } from "./usePlanResults";
import { newClientId } from "./clientId";
import { PlanConfirm } from "./PlanConfirm";
import { AiPlanInput } from "./AiPlanInput";
import { samePlace } from "../shared/plan";

export function PlanPage({
  controller,
  onResult,
  onEdit,
  active,
  mode,
  ...actions
}: {
  controller: LocalPlanController;
  onResult: () => void;
  onEdit: () => void;
  active: boolean;
  mode: "edit" | "results";
} & PlanActions) {
  const { plan, updateStops, clear } = controller;
  const zh = plan.language === "zh-CN";
  const [editing, setEditing] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Place | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [started, setStarted] = useState(mode === "results");
  useEffect(() => {
    if (mode === "results") setStarted(true);
  }, [mode]);
  const results = usePlanResults(
    plan,
    active && started,
    controller.cacheEpoch,
  );
  function choose(place: Place, confirmed = false) {
    if (place.originType === "geolocation") return;
    if (
      !confirmed &&
      plan.stops.some((s) => s.stopId !== editing && samePlace(s.place, place))
    ) {
      setDuplicate(place);
      return;
    }
    const stopId = newClientId("stop");
    updateStops((stops) =>
      editing === "new"
        ? [...stops, { stopId, place }].slice(0, 10)
        : stops.map((s) =>
            s.stopId === editing
              ? { stopId: s.stopId, place, note: s.note }
              : s,
          ),
    );
    setEditing(null);
    setDuplicate(null);
  }
  function move(index: number, delta: number) {
    updateStops((stops) => {
      const next = [...stops];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  return (
    <main className="plan-page" hidden={!active}>
      <div className="eyebrow">
        {zh ? "按你的顺序，安心停靠" : "YOUR DAY, YOUR OWN ORDER"}
      </div>
      <h1>{zh ? "规划景点停靠" : "Plan my stops"}</h1>
      <p>
        {zh
          ? "添加 1–10 个北京景点或入口，逐站寻找附近的厕所。"
          : "Add 1–10 Beijing attractions or entrances for a comfort stop nearby."}
      </p>
      <PlanSettings settings={plan} onChange={controller.changeSettings} />
      <AiPlanInput
        controller={controller}
        active={active && mode === "edit"}
        onConfirmed={onResult}
      />
      {mode === "results" ? (
        <PlanResults
          controller={controller}
          results={results}
          onEdit={onEdit}
          {...actions}
        />
      ) : (
        <section className="plan-editor">
          <h2>
            {zh ? "你的北京行程" : "Your Beijing stops"}{" "}
            <span className="muted">{plan.stops.length} / 10</span>
          </h2>
          {plan.stops.length === 0 && (
            <p className="notice">
              {zh ? "添加你的第一站。" : "Add your first stop."}
            </p>
          )}
          {plan.stops.map((stop, index) => (
            <div
              className="plan-stop"
              key={stop.stopId}
              data-stop-id={stop.stopId}
            >
              <span className="stop-number">{index + 1}</span>
              <div className="stop-place">
                <button
                  className="text-link"
                  aria-label={`${zh ? "更换景点" : "Replace stop"} ${index + 1}`}
                  onClick={() => setEditing(stop.stopId)}
                >
                  {stop.place.nameEn && !zh
                    ? stop.place.nameEn
                    : stop.place.nameZh}
                </button>
                <p>
                  {stop.place.nameZh} · {stop.place.district} ·{" "}
                  {stop.place.addressZh}
                </p>
                {stop.note && <p className="muted">{stop.note}</p>}
              </div>
              <div className="stop-tools">
                <button
                  className="icon-button"
                  aria-label={zh ? "上移" : "Move up"}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  aria-label={zh ? "下移" : "Move down"}
                  disabled={index === plan.stops.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  className="icon-button"
                  aria-label={zh ? "删除景点" : "Remove stop"}
                  onClick={() =>
                    updateStops((stops) =>
                      stops.filter((s) => s.stopId !== stop.stopId),
                    )
                  }
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <div className="plan-actions">
            <button
              className="secondary"
              onClick={() => setEditing("new")}
              disabled={plan.stops.length >= 10}
            >
              {zh ? "添加景点" : "Add a stop"}
            </button>
            <button
              className="primary"
              disabled={!plan.stops.length}
              onClick={onResult}
            >
              {zh ? "生成逐站推荐" : "Find toilets for my stops"}
            </button>
            <button className="text-link" onClick={() => setClearConfirm(true)}>
              {zh ? "清除行程" : "Clear plan"}
            </button>
          </div>
        </section>
      )}
      {active && editing && !duplicate && (
        <PlacePicker
          language={plan.language}
          allowGeolocation={false}
          onSelect={(place) => choose(place)}
          onClose={() => setEditing(null)}
        />
      )}
      {active && duplicate && (
        <PlanConfirm
          title={zh ? "重复景点" : "Repeated visit"}
          onCancel={() => {
            setDuplicate(null);
            setEditing(null);
          }}
        >
          <p>
            {zh
              ? "行程中已有这个地点。是否再次添加？"
              : "This place is already in your plan. Add another visit?"}
          </p>
          <div className="plan-actions">
            <button
              className="secondary"
              onClick={() => {
                setDuplicate(null);
                setEditing(null);
              }}
            >
              {zh ? "取消" : "Cancel"}
            </button>
            <button className="primary" onClick={() => choose(duplicate, true)}>
              {zh ? "再次添加" : "Add again"}
            </button>
          </div>
        </PlanConfirm>
      )}
      {active && clearConfirm && (
        <PlanConfirm
          title={zh ? "清除行程" : "Clear plan"}
          onCancel={() => setClearConfirm(false)}
        >
          <p>
            {zh
              ? "清除本机行程及选择，保留语言？"
              : "Clear this plan and its choices? Your language will be kept."}
          </p>
          <div className="plan-actions">
            <button
              className="secondary"
              onClick={() => setClearConfirm(false)}
            >
              {zh ? "保留行程" : "Keep plan"}
            </button>
            <button
              className="primary"
              onClick={() => {
                clear();
                setClearConfirm(false);
              }}
            >
              {zh ? "确认清除" : "Confirm clear"}
            </button>
          </div>
        </PlanConfirm>
      )}
    </main>
  );
}
