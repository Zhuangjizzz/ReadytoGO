import { useEffect, useRef, useState } from "react";
import type { Language, Origin } from "../shared/contracts";
import { api, ApiError } from "./api";
let current: { origin: Origin; at: number } | null = null;
export function sessionLocation(): Origin | null {
  return current && Date.now() - current.at < 120_000 ? current.origin : null;
}
export async function locate(
  language: Language,
  signal?: AbortSignal,
): Promise<Origin> {
  if (!window.isSecureContext || !navigator.geolocation)
    throw new ApiError("GPS_UNAVAILABLE", "", false, 0);
  const position = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 60_000,
      timeout: 10_000,
    }),
  );
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const result = await api<Origin>("/location/convert", {
    method: "POST",
    body: JSON.stringify({
      lng: position.coords.longitude,
      lat: position.coords.latitude,
      crs: "WGS84",
      accuracyMeters: position.coords.accuracy,
      language,
    }),
    signal,
  });
  current = { origin: result.data, at: Date.now() };
  return result.data;
}
export function locationError(error: unknown, language: Language) {
  const zh = language === "zh-CN";
  if (error instanceof ApiError && error.code === "OUTSIDE_BEIJING")
    return zh
      ? "目前位置不在北京，请搜索或在地图选择北京起点。"
      : "Your location is outside Beijing. Search or pick a Beijing starting point.";
  if (error instanceof ApiError && error.code === "GPS_UNAVAILABLE")
    return zh
      ? "当前浏览器无法定位，请搜索地点或在地图选点。"
      : "Location is unavailable in this browser. Search for a place or choose a point on the map.";
  if (error && typeof error === "object" && "code" in error && error.code === 1)
    return zh
      ? "定位权限未开启，可以搜索地点或在地图选点。"
      : "Location permission was declined. Search for a place or choose a point on the map.";
  return zh
    ? "暂时无法取得当前位置，请重试或手动选择起点。"
    : "Could not get your current location. Retry or choose a starting point manually.";
}
export function LocateButton({
  language,
  onSelect,
  auto = false,
}: {
  language: Language;
  onSelect: (origin: Origin) => void;
  auto?: boolean;
}) {
  const zh = language === "zh-CN";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = useRef<AbortController | null>(null);
  async function run() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage("");
    try {
      const origin = await locate(language, controller.signal);
      if (!controller.signal.aborted) {
        onSelect(origin);
        setMessage(
          (origin.accuracyMeters ?? 0) > 150
            ? zh
              ? `这是大致位置（精度约 ${Math.round(origin.accuracyMeters!)} 米），可继续或修改起点。`
              : `Approximate location (accuracy about ${Math.round(origin.accuracyMeters!)} m). Continue or change your starting point.`
            : "",
        );
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(locationError(error, language));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (auto) void run();
    return () => active.current?.abort();
  }, []);
  return (
    <div className="location-controls">
      <button className="secondary" onClick={run} disabled={busy}>
        {busy
          ? zh
            ? "正在定位…"
            : "Getting your location…"
          : zh
            ? "使用当前位置"
            : "Use current location"}
      </button>
      {message && (
        <p className="notice location-status" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
