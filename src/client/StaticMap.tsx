import { useEffect, useRef, useState } from "react";
import type { Language, Position } from "../shared/contracts";
import "./wayfinding.css";

export interface MapMarker {
  id: string;
  position: Position;
  label: string;
  number?: number;
  origin?: boolean;
}
const size = { width: 640, height: 480 };
// Isolated adapter convention: Amap scale=1 was calibrated with real marker tips.
// At zoom 14, (116.400,39.911) is (390,179) relative to center (116.397,39.909).
const pixel = (p: Position, zoom: number) => {
  const world = 512 * 2 ** zoom;
  const lat = (Math.max(-85, Math.min(85, p.lat)) * Math.PI) / 180;
  return {
    x: ((p.lng + 180) / 360) * world,
    y:
      (0.5 -
        Math.log((1 + Math.sin(lat)) / (1 - Math.sin(lat))) / (4 * Math.PI)) *
      world,
  };
};
const coordinate = (x: number, y: number, zoom: number): Position => {
  const world = 512 * 2 ** zoom;
  return {
    lng: (x / world) * 360 - 180,
    lat:
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / world))) * 180) / Math.PI,
    crs: "GCJ02",
  };
};
const inBeijing = (p: Position) =>
  p.lng >= 115.4 && p.lng <= 117.6 && p.lat >= 39.4 && p.lat <= 41.1;

export function StaticMap({
  center,
  markers = [],
  selectedId,
  language,
  onSelect,
  onPick,
  zoom: initialZoom = 14,
}: {
  center: Position;
  markers?: MapMarker[];
  selectedId?: string | null;
  language: Language;
  onSelect?: (id: string) => void;
  onPick?: (position: Position) => void;
  zoom?: number;
}) {
  const zh = language === "zh-CN";
  const [view, setView] = useState(center);
  const [zoom, setZoom] = useState(initialZoom);
  const [ready, setReady] = useState("");
  const [failed, setFailed] = useState("");
  const [retry, setRetry] = useState(0);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const previousSelection = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    setView(center);
  }, [center.lng, center.lat]);
  useEffect(() => {
    if (selectedId && selectedId !== previousSelection.current) {
      const selected = markers.find((m) => m.id === selectedId);
      if (selected) setView(selected.position);
    }
    previousSelection.current = selectedId;
  }, [selectedId, markers]);
  const url = `/api/v1/maps/static?${new URLSearchParams({ lng: view.lng.toFixed(6), lat: view.lat.toFixed(6), zoom: String(zoom), width: String(size.width), height: String(size.height) })}`;
  const token = `${url}:${retry}`;
  const loaded = ready === token;
  const error = failed === token;
  const centerPixel = pixel(view, zoom);
  function shift(dx: number, dy: number) {
    const next = coordinate(centerPixel.x + dx, centerPixel.y + dy, zoom);
    if (inBeijing(next)) setView(next);
  }
  function endPointer(e: React.PointerEvent<HTMLDivElement>) {
    const start = pointer.current;
    if (!start || start.id !== e.pointerId) return;
    pointer.current = null;
    const dx = e.clientX - start.x,
      dy = e.clientY - start.y;
    setDrag({ x: 0, y: 0 });
    if (Math.hypot(dx, dy) > 5)
      shift(
        (-dx * size.width) / start.width,
        (-dy * size.height) / start.height,
      );
    else if (onPick && loaded && frame.current) {
      const rect = frame.current.getBoundingClientRect();
      const p = coordinate(
        centerPixel.x +
          ((e.clientX - rect.left) * size.width) / rect.width -
          size.width / 2,
        centerPixel.y +
          ((e.clientY - rect.top) * size.height) / rect.height -
          size.height / 2,
        zoom,
      );
      onPick(p);
    }
  }
  return (
    <section
      className="map-section"
      aria-label={zh ? "高德交互地图" : "Interactive Amap map"}
    >
      <div
        ref={frame}
        className={`static-map ${onPick ? "pick-map" : ""}`}
        role="group"
        aria-label={
          zh ? "拖动地图；使用按钮缩放" : "Drag map; use buttons to zoom"
        }
        onPointerDown={(e) => {
          if (
            !loaded ||
            e.button !== 0 ||
            (e.target as HTMLElement).closest("button, a")
          )
            return;
          const rect = e.currentTarget.getBoundingClientRect();
          pointer.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            width: rect.width,
            height: rect.height,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (pointer.current?.id === e.pointerId)
            setDrag({
              x: e.clientX - pointer.current.x,
              y: e.clientY - pointer.current.y,
            });
        }}
        onPointerUp={endPointer}
        onPointerCancel={() => {
          pointer.current = null;
          setDrag({ x: 0, y: 0 });
        }}
      >
        <div
          className="map-layer"
          style={{ transform: `translate(${drag.x}px,${drag.y}px)` }}
        >
          <img
            key={token}
            src={url}
            alt={zh ? "高德提供的北京地图底图" : "Beijing map provided by Amap"}
            width={640}
            height={480}
            draggable={false}
            onLoad={() => setReady(token)}
            onError={() => setFailed(token)}
            style={{ visibility: loaded ? "visible" : "hidden" }}
          />
          {loaded &&
            markers.map((m) => {
              const point = pixel(m.position, zoom);
              const left = size.width / 2 + point.x - centerPixel.x;
              const top = size.height / 2 + point.y - centerPixel.y;
              if (left < 0 || left > size.width || top < 0 || top > size.height)
                return null;
              return m.origin ? (
                <span
                  key={m.id}
                  className="map-origin"
                  title={m.label}
                  aria-label={m.label}
                  style={{
                    left: `${(left / size.width) * 100}%`,
                    top: `${(top / size.height) * 100}%`,
                  }}
                />
              ) : (
                <button
                  key={m.id}
                  type="button"
                  className={`map-marker ${m.id === selectedId ? "selected" : ""}`}
                  aria-label={m.label}
                  aria-pressed={m.id === selectedId}
                  style={{
                    left: `${(left / size.width) * 100}%`,
                    top: `${(top / size.height) * 100}%`,
                  }}
                  onClick={() => onSelect?.(m.id)}
                >
                  <svg viewBox="0 0 44 48" aria-hidden="true">
                    <path d="M22 47C17 40 5 30 5 20a17 17 0 1 1 34 0c0 10-12 24-17 27Z" />
                  </svg>
                  <span>{m.number ?? "•"}</span>
                </button>
              );
            })}
        </div>
        {!loaded && (
          <div className="map-status" role="status">
            {error ? (
              <>
                <strong>{zh ? "地图暂不可用" : "Map unavailable"}</strong>
                <p>
                  {zh
                    ? "地点搜索、列表和导航仍可使用。"
                    : "Place search, list results and navigation remain available."}
                </p>
                <button
                  className="secondary"
                  onClick={() => {
                    setFailed("");
                    setRetry((n) => n + 1);
                  }}
                >
                  {zh ? "重试地图" : "Retry map"}
                </button>
              </>
            ) : (
              <>
                <div className="spinner" />
                {zh ? "正在加载高德地图…" : "Loading Amap…"}
              </>
            )}
          </div>
        )}
        <div className="map-tools">
          <button
            aria-label={zh ? "放大" : "Zoom in"}
            disabled={zoom >= 17 || !loaded}
            onClick={() => setZoom((z) => z + 1)}
          >
            +
          </button>
          <button
            aria-label={zh ? "缩小" : "Zoom out"}
            disabled={zoom <= 3 || !loaded}
            onClick={() => setZoom((z) => z - 1)}
          >
            −
          </button>
          <button
            aria-label={zh ? "返回起点" : "Recenter on origin"}
            disabled={!loaded}
            onClick={() => setView(center)}
          >
            ◎
          </button>
        </div>
        <a
          className="map-attribution"
          href="https://www.amap.com"
          target="_blank"
          rel="noreferrer"
        >
          © 高德地图 Amap
        </a>
      </div>
      <div className="map-pan" aria-label={zh ? "移动地图" : "Move map"}>
        <button
          disabled={!loaded}
          aria-label={zh ? "向西移动" : "Pan west"}
          onClick={() => shift(-160, 0)}
        >
          ←
        </button>
        <button
          disabled={!loaded}
          aria-label={zh ? "向北移动" : "Pan north"}
          onClick={() => shift(0, -120)}
        >
          ↑
        </button>
        <span>
          {onPick
            ? zh
              ? "轻触地图选起点"
              : "Tap map to choose a point"
            : zh
              ? "轻触标记查看厕所"
              : "Tap a marker to select a toilet"}
        </span>
        <button
          disabled={!loaded}
          aria-label={zh ? "向南移动" : "Pan south"}
          onClick={() => shift(0, 120)}
        >
          ↓
        </button>
        <button
          disabled={!loaded}
          aria-label={zh ? "向东移动" : "Pan east"}
          onClick={() => shift(160, 0)}
        >
          →
        </button>
      </div>
      {onPick && (
        <button
          className="secondary map-center-pick"
          disabled={!loaded}
          onClick={() => onPick(view)}
        >
          {zh ? "选择地图中心" : "Choose map center"}
        </button>
      )}
    </section>
  );
}
