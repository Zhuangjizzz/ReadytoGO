import { useEffect, useState } from "react";
import type { Language, Origin } from "../shared/contracts";
import type { NavigationResult } from "../shared/navigation";
import { api } from "./api";
import { locate, locationError, sessionLocation } from "./LocateButton";

export function Navigation({
  toiletId,
  origin,
  language,
}: {
  toiletId: string;
  origin: Origin | null;
  language: Language;
}) {
  const zh = language === "zh-CN";
  const [selected, setSelected] = useState<Origin | null>(origin);
  const [source, setSource] = useState<"selected" | "current">("selected");
  const [result, setResult] = useState<NavigationResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [gpsMessage, setGpsMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (source === "selected") setSelected(origin);
  }, [origin, source]);
  useEffect(() => {
    const controller = new AbortController();
    // Clear both numbers and links while the new origin is calculated.
    setResult(null);
    setBusy(true);
    setError("");
    setCopied(false);
    api<NavigationResult>("/navigation/link", {
      method: "POST",
      body: JSON.stringify({
        toiletId,
        origin: selected,
        language,
        retry: retry > 0,
      }),
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) setResult(r.data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            zh
              ? "导航信息暂不可用，请重试。"
              : "Navigation information is unavailable. Please retry.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [toiletId, selected, language, retry]);
  async function useCurrent() {
    setLocating(true);
    setGpsMessage("");
    try {
      const found = sessionLocation() ?? (await locate(language));
      setSelected(found);
      setSource("current");
      if ((found.accuracyMeters ?? 0) > 150)
        setGpsMessage(
          zh
            ? "当前位置精度较低，可以切回所选起点。"
            : "Current location is approximate. You can return to the selected starting point.",
        );
    } catch (e) {
      setGpsMessage(locationError(e, language));
    } finally {
      setLocating(false);
    }
  }
  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.copyText);
      setCopied(true);
    } catch {
      setGpsMessage(
        zh
          ? "请长按下面的中文名称地址复制。"
          : "Press and hold the Chinese name and address below to copy.",
      );
    }
  }
  return (
    <section
      className="navigation-panel"
      aria-label={zh ? "导航" : "Navigation"}
    >
      <h2>{zh ? "前往这里" : "Get there"}</h2>
      <div className="nav-choice">
        <button
          className={source === "selected" ? "active" : ""}
          aria-pressed={source === "selected"}
          disabled={!origin || locating}
          onClick={() => {
            setSource("selected");
            setSelected(origin);
            setGpsMessage("");
          }}
        >
          {zh ? "从所选起点出发" : "From selected starting point"}
        </button>
        <button
          className={source === "current" ? "active" : ""}
          aria-pressed={source === "current"}
          disabled={locating}
          onClick={useCurrent}
        >
          {locating
            ? zh
              ? "正在定位…"
              : "Locating…"
            : zh
              ? "从当前位置出发"
              : "From current location"}
        </button>
      </div>
      <p className="navigation-origin">
        {selected
          ? `${zh ? "出发地" : "From"}：${selected.label}`
          : zh
            ? "使用当前位置，或在地图中选择起点。"
            : "Use your location, or select an origin in Amap."}
      </p>
      {gpsMessage && (
        <p className="notice" role="status">
          {gpsMessage}
        </p>
      )}
      <div className="navigation-metrics" aria-live="polite">
        {busy
          ? zh
            ? "正在计算步行路线…"
            : "Calculating walking route…"
          : result?.routeStatus === "success" &&
              result.walkSeconds !== null &&
              result.walkMeters !== null
            ? `${Math.max(1, Math.ceil(result.walkSeconds / 60))} ${zh ? "分钟" : "min"} · ${result.walkMeters >= 1000 ? `${(result.walkMeters / 1000).toFixed(1)} km` : `${Math.round(result.walkMeters)} m`}`
            : zh
              ? "步行时间暂不可用"
              : "Walking time unavailable"}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!busy && (!result || result.routeStatus === "provider_error") && (
        <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
          {zh ? "重新计算" : "Retry route"}
        </button>
      )}
      {result && (
        <>
          <div className="navigation-links">
            {result.appUrl && (
              <a
                className="primary"
                href={result.appUrl}
                target="_blank"
                rel="noreferrer"
              >
                {zh ? "打开高德 App" : "Open Amap app"} ↗
              </a>
            )}
            <a
              className="secondary"
              href={result.webUrl ?? result.searchUrl}
              target="_blank"
              rel="noreferrer"
            >
              {result.webUrl
                ? zh
                  ? "打开网页路线"
                  : "Open web route"
                : zh
                  ? "在高德地图搜索"
                  : "Search in Amap"}{" "}
              ↗
            </a>
            <button className="secondary" onClick={copy}>
              {copied
                ? zh
                  ? "已复制"
                  : "Copied"
                : zh
                  ? "复制中文名称地址"
                  : "Copy Chinese name & address"}
            </button>
          </div>
          <p className="fine-print">
            {result.destination
              ? zh
                ? "如果 App 未打开，可使用上方网页入口。"
                : "If the app does not open, use the web link above."
              : zh
                ? "此地点坐标缺失，可用中文名称地址在地图搜索。"
                : "Coordinates are unavailable. Search the Chinese name and address in Amap."}
          </p>
          <p className="navigation-copy" tabIndex={0}>
            {result.copyText}
          </p>
        </>
      )}
    </section>
  );
}
