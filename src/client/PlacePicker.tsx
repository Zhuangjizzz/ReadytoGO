import { useEffect, useRef, useState } from "react";
import type { Language, Place, Position } from "../shared/contracts";
import { StaticMap } from "./StaticMap";
import { LocateButton } from "./LocateButton";
import { api, ApiError, searchPlaces } from "./api";
export function PlacePicker({
  language,
  onSelect,
  onClose,
  initialPosition,
  allowGeolocation = true,
}: {
  language: Language;
  onSelect: (place: Place) => void;
  onClose: () => void;
  initialPosition?: Position;
  allowGeolocation?: boolean;
}) {
  const zh = language === "zh-CN";
  const [tab, setTab] = useState<"search" | "map">("search");
  const [picked, setPicked] = useState<Place | null>(null);
  const [resolving, setResolving] = useState(false);
  const [mapError, setMapError] = useState("");
  const pointRequest = useRef<AbortController | null>(null);
  async function pickPoint(position: Position) {
    pointRequest.current?.abort();
    const controller = new AbortController();
    pointRequest.current = controller;
    setResolving(true);
    setPicked(null);
    setMapError("");
    try {
      const r = await api<Place>("/location/resolve", {
        method: "POST",
        body: JSON.stringify({ ...position, language }),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setPicked(r.data);
    } catch (e) {
      if (!controller.signal.aborted)
        setMapError(
          e instanceof ApiError && e.code === "OUTSIDE_BEIJING"
            ? zh
              ? "请选择北京市内的位置。"
              : "Choose a point within Beijing."
            : zh
              ? "无法确认该位置，请重试或搜索地点。"
              : "This point could not be confirmed. Try again or search for a place.",
        );
    } finally {
      if (!controller.signal.aborted) setResolving(false);
    }
  }
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<
    "idle" | "loading" | "complete" | "error"
  >("idle");
  const [error, setError] = useState("");
  const version = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      abort.current?.abort();
      pointRequest.current?.abort();
    };
  }, []);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    const id = ++version.current;
    abort.current?.abort();
    abort.current = new AbortController();
    setStatus("loading");
    setError("");
    try {
      const result = await searchPlaces(q, language, abort.current.signal);
      if (id !== version.current) return;
      setPlaces(result.data.places);
      setStatus("complete");
    } catch (e) {
      if (id !== version.current || abort.current?.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Search unavailable");
      setStatus("error");
    }
  }
  return (
    <dialog ref={dialog} className="place-dialog" onCancel={onClose}>
      <div className="dialog-heading">
        <h2>{zh ? "选择北京起点" : "Choose a starting point"}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={zh ? "关闭" : "Close"}
        >
          ×
        </button>
      </div>
      <p className="muted">
        {zh
          ? "搜索景点、地铁站或具体入口。"
          : "Search an attraction, station or entrance in Beijing."}
      </p>
      {allowGeolocation && (
        <LocateButton
          language={language}
          onSelect={(origin) =>
            onSelect({
              provider: "manual",
              poiId: null,
              nameZh: origin.label,
              nameEn: null,
              addressZh: "",
              district: "",
              city: "北京市",
              position: origin,
              originType: "geolocation",
            })
          }
        />
      )}
      <div className="segment picker-tabs">
        <button
          type="button"
          className={tab === "search" ? "active" : ""}
          aria-pressed={tab === "search"}
          onClick={() => setTab("search")}
        >
          {zh ? "搜索地点" : "Search places"}
        </button>
        <button
          type="button"
          className={tab === "map" ? "active" : ""}
          aria-pressed={tab === "map"}
          onClick={() => setTab("map")}
        >
          {zh ? "地图选点" : "Choose on map"}
        </button>
      </div>
      {tab === "map" ? (
        <div className="picker-preview">
          <StaticMap
            center={
              initialPosition ?? { lng: 116.397, lat: 39.909, crs: "GCJ02" }
            }
            markers={
              picked
                ? [
                    {
                      id: "picked",
                      position: picked.position,
                      label: picked.nameZh,
                      origin: true,
                    },
                  ]
                : []
            }
            language={language}
            onPick={pickPoint}
          />
          <div aria-live="polite">
            {resolving && (
              <p className="notice">
                {zh ? "正在确认所选位置…" : "Confirming selected point…"}
              </p>
            )}
            {mapError && <p className="notice error">{mapError}</p>}
            {picked && (
              <div className="picked-point">
                <strong>{picked.nameZh}</strong>
                <span>{picked.district}</span>
                <code>
                  {picked.position.lng.toFixed(6)},{" "}
                  {picked.position.lat.toFixed(6)}
                </code>
              </div>
            )}
          </div>
          <button
            className="primary select-map-point"
            disabled={!picked || resolving}
            onClick={() => picked && onSelect(picked)}
          >
            {zh ? "确定此起点" : "Use this starting point"}
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={search} className="search-form">
            <label className="sr-only" htmlFor="place-search">
              {zh ? "地点名称" : "Place name"}
            </label>
            <input
              id="place-search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={zh ? "输入地点名称" : "Where are you starting?"}
              maxLength={120}
            />
            <button
              className="primary"
              disabled={status === "loading" || !q.trim()}
            >
              {status === "loading"
                ? zh
                  ? "查询中…"
                  : "Searching…"
                : zh
                  ? "搜索"
                  : "Search"}
            </button>
          </form>
          <div aria-live="polite">
            {error && <p className="notice error">{error}</p>}
            {status === "complete" && places.length === 0 && (
              <p className="notice">
                {zh
                  ? "没有找到北京地点，试试更具体的名称。"
                  : "No Beijing places found. Try a more specific name."}
              </p>
            )}
          </div>
          <ul className="place-list">
            {places.map((p) => (
              <li key={p.poiId}>
                <button onClick={() => onSelect(p)}>
                  <strong>{p.nameZh}</strong>
                  <span>
                    {p.district} · {p.addressZh || p.city}
                  </span>
                  <span className="place-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </dialog>
  );
}
