import { useEffect, useRef, useState } from "react";
import type { Language, Place } from "../shared/contracts";
import { searchPlaces } from "./api";
export function PlacePicker({
  language,
  onSelect,
  onClose,
}: {
  language: Language;
  onSelect: (place: Place) => void;
  onClose: () => void;
}) {
  const zh = language === "zh-CN";
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
    return () => abort.current?.abort();
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
    </dialog>
  );
}
