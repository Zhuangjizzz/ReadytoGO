import { useEffect, useRef, useState } from "react";
import type {
  PlanLocal,
  PlanPreviewResult,
  PlanStop,
  SearchResult,
} from "../shared/contracts";
import { placeOrigin, querySettings } from "../shared/plan";
import { api } from "./api";
import { mergeSearchPages } from "../shared/searchResults";

type StopResult = {
  key: string;
  result: SearchResult | null;
  pages: Map<string, SearchResult>;
  loading: boolean;
  error: string | null;
  expires: number;
};
function calculationKey(stop: PlanStop, plan: PlanLocal) {
  return JSON.stringify([
    stop.stopId,
    placeOrigin(stop.place),
    querySettings(plan),
  ]);
}
export function usePlanResults(
  plan: PlanLocal,
  active: boolean,
  cacheEpoch: number,
) {
  const [states, setStates] = useState<Record<string, StopResult>>({});
  const statesRef = useRef(states);
  statesRef.current = states;
  const live = useRef({ plan, active, cacheEpoch });
  live.current = { plan, active, cacheEpoch };
  const commands = useRef(
    new Map<string, { cursor: string | null; retry: boolean }>(),
  );
  const epoch = useRef(cacheEpoch);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controllers: AbortController[] = [];
    const reset = epoch.current !== cacheEpoch;
    epoch.current = cacheEpoch;
    if (reset) commands.current.clear();
    const entries: Record<string, StopResult> = {};
    for (const stop of plan.stops) {
      const key = calculationKey(stop, plan);
      const previous = statesRef.current[stop.stopId];
      entries[stop.stopId] =
        !reset && previous?.key === key && previous.expires > Date.now()
          ? previous
          : {
              key,
              result: null,
              pages: new Map(),
              loading: false,
              error: null,
              expires: Date.now() + 15 * 60_000,
            };
    }
    statesRef.current = entries;
    setStates(entries);
    if (!active) return;
    for (const stop of plan.stops) {
      const entry = entries[stop.stopId];
      const command = commands.current.get(stop.stopId);
      commands.current.delete(stop.stopId);
      if (
        !command &&
        (entry.error || (entry.result && !entry.result.pendingWork))
      )
        continue;
      const controller = new AbortController();
      controllers.push(controller);
      const revision = plan.revision;
      const current = () =>
        !controller.signal.aborted &&
        live.current.active &&
        live.current.cacheEpoch === cacheEpoch &&
        live.current.plan.revision === revision &&
        live.current.plan.stops.some(
          (s) =>
            s.stopId === stop.stopId &&
            calculationKey(s, live.current.plan) === entry.key,
        );
      const publish = (patch: Partial<StopResult>) => {
        if (!current()) return;
        Object.assign(entry, patch);
        setStates((value) => ({ ...value, [stop.stopId]: { ...entry } }));
      };
      const pages = command?.retry
        ? new Map<string, SearchResult>()
        : new Map(entry.pages);
      let cursor = command?.cursor ?? entry.result?.batchCursor ?? null;
      if (command?.retry) cursor = null;
      publish({ loading: true, error: null });
      void (async () => {
        const deadline = Date.now() + 130_000;
        let retry = command?.retry ?? false;
        try {
          while (current()) {
            const reply = await api<PlanPreviewResult>("/plans/preview", {
              method: "POST",
              body: JSON.stringify({
                ...querySettings(plan),
                revision,
                stops: [
                  { stopId: stop.stopId, place: stop.place, cursor, retry },
                ],
              }),
              signal: controller.signal,
            });
            if (!current() || reply.data.revision !== revision) return;
            const found = reply.data.stops.find(
              (s) => s.stopId === stop.stopId,
            );
            if (!found || found.error || !found.result)
              throw new Error(
                found?.error?.message ?? "This stop could not be searched.",
              );
            const result = found.result;
            if (result.queryVersion !== revision) return;
            pages.set(result.batchCursor ?? cursor ?? "first", result);
            publish({
              pages,
              result: mergeSearchPages(pages, result),
              loading: result.pendingWork,
            });
            if (!result.pendingWork) return;
            if (Date.now() >= deadline)
              throw new Error(
                plan.language === "zh-CN"
                  ? "等待已结束，可重试本站。"
                  : "Waiting has stopped. Retry this stop when ready.",
              );
            cursor = result.batchCursor ?? cursor;
            retry = false;
            await new Promise<void>((resolve) => {
              const done = () => {
                clearTimeout(timer);
                controller.signal.removeEventListener("abort", done);
                resolve();
              };
              const timer = setTimeout(done, 500);
              controller.signal.addEventListener("abort", done, { once: true });
            });
          }
        } catch (error) {
          publish({
            error:
              error instanceof Error
                ? error.message
                : "This stop could not be searched.",
          });
        } finally {
          publish({ loading: false });
        }
      })();
    }
    return () => controllers.forEach((controller) => controller.abort());
  }, [plan.revision, active, cacheEpoch, refresh]);
  const refreshStop = (stopId: string, cursor: string | null = null) => {
    commands.current.set(stopId, { cursor, retry: cursor === null });
    setRefresh((n) => n + 1);
  };
  function forStop(stop: PlanStop) {
    const entry = states[stop.stopId];
    return entry?.key === calculationKey(stop, plan) ? entry : undefined;
  }
  return { forStop, refreshStop };
}
