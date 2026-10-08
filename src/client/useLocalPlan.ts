import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type {
  Language,
  PlanLocal,
  PlanStop,
  QuerySettings,
} from "../shared/contracts";

const key = "readytogo-plan";
const place = z.object({
  provider: z.enum(["amap", "manual"]),
  poiId: z.string().nullable(),
  nameZh: z.string().min(1).max(200),
  nameEn: z.string().nullable(),
  addressZh: z.string(),
  district: z.string(),
  city: z.string(),
  originType: z.enum(["poi", "map"]),
  position: z.object({
    lng: z.number().finite().min(115.4).max(117.6),
    lat: z.number().finite().min(39.4).max(41.1),
    crs: z.literal("GCJ02"),
  }),
});
const schema = z.object({
  schemaVersion: z.literal(1),
  language: z.enum(["en", "zh-CN"]),
  preference: z.enum(["any", "seated_required"]),
  includeConditionalAccess: z.boolean(),
  walkLimitMinutes: z.union([z.literal(10), z.literal(20)]),
  extendedRadiusKm: z.union([z.literal(5), z.literal(10)]),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
  stops: z
    .array(
      z.object({
        stopId: z.string().min(1),
        place,
        note: z.string().optional(),
        selectedToiletId: z.string().nullable().optional(),
        skipped: z.boolean().optional(),
      }),
    )
    .max(10)
    .refine(
      (stops) => new Set(stops.map((s) => s.stopId)).size === stops.length,
    ),
});
export function emptyPlan(language: Language = "en"): PlanLocal {
  return {
    schemaVersion: 1,
    language,
    preference: "any",
    includeConditionalAccess: false,
    walkLimitMinutes: 10,
    extendedRadiusKm: 5,
    revision: 0,
    stops: [],
    updatedAt: new Date().toISOString(),
  };
}
function restore(): {
  plan: PlanLocal;
  notice: "storage" | "version" | "invalid" | null;
} {
  const plan = emptyPlan();
  try {
    plan.language =
      localStorage.getItem("readytogo-language") === "zh-CN" ? "zh-CN" : "en";
    const raw = localStorage.getItem(key);
    if (raw) {
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        return { plan, notice: "invalid" };
      }
      if (
        !value ||
        typeof value !== "object" ||
        !("schemaVersion" in value) ||
        value.schemaVersion !== 1
      )
        return { plan, notice: "version" };
      const parsed = schema.safeParse(value);
      return parsed.success
        ? { plan: parsed.data, notice: null }
        : { plan, notice: "invalid" };
    }
    plan.preference =
      localStorage.getItem("readytogo-preference") === "seated_required"
        ? "seated_required"
        : "any";
    plan.includeConditionalAccess =
      localStorage.getItem("readytogo-conditional") === "true";
    return { plan, notice: null };
  } catch {
    return { plan, notice: "storage" };
  }
}
export function useLocalPlan() {
  const [initial] = useState(restore);
  const [plan, setPlan] = useState(initial.plan);
  const [notice, setNotice] = useState(initial.notice);
  const dirty = useRef(false);
  const [cacheEpoch, setCacheEpoch] = useState(0);
  const change = useCallback((update: (value: PlanLocal) => PlanLocal) => {
    dirty.current = true;
    setPlan((value) => {
      const next = update(value);
      if (next === value) return value;
      return {
        ...next,
        revision: value.revision + 1,
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);
  const changeSettings = useCallback(
    (patch: Partial<QuerySettings>) =>
      change((value) => ({ ...value, ...patch })),
    [change],
  );
  const updateStops = useCallback(
    (update: (stops: PlanStop[]) => PlanStop[]) =>
      change((value) => ({ ...value, stops: update(value.stops) })),
    [change],
  );
  const replaceStops = useCallback(
    (stops: PlanStop[], preference?: PlanLocal["preference"]) => {
      const valid = schema.safeParse({ ...emptyPlan(), stops });
      if (!valid.success || stops.length < 1)
        throw new Error("Choose one to ten Beijing places first.");
      change((value) => ({
        ...value,
        stops: valid.data.stops,
        preference: preference ?? value.preference,
      }));
      setCacheEpoch((n) => n + 1);
    },
    [change],
  );
  const clear = useCallback(() => {
    change((value) => emptyPlan(value.language));
    setCacheEpoch((n) => n + 1);
  }, [change]);
  useEffect(() => {
    if (!dirty.current) return;
    try {
      // Parse before writing so browser GPS and unrelated object fields never reach storage.
      const value = schema.parse(plan);
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem("readytogo-language", value.language);
      localStorage.removeItem("readytogo-preference");
      localStorage.removeItem("readytogo-conditional");
      setNotice(null);
    } catch {
      setNotice("storage");
    }
  }, [plan]);
  return {
    plan,
    notice,
    changeSettings,
    updateStops,
    replaceStops,
    clear,
    cacheEpoch,
  };
}
export type LocalPlanController = ReturnType<typeof useLocalPlan>;
