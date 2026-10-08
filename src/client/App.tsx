import { useEffect, useRef, useState } from "react";
import type {
  Candidate,
  Language,
  Origin,
  Place,
  Preference,
  SearchRequest,
  SearchResult,
} from "../shared/contracts";
import { PlacePicker } from "./PlacePicker";
import { searchToilets } from "./api";
const names = {
  en: {
    matched: "Within your walking time",
    farther: "A little farther",
    otherNearby: "Other nearby toilets",
    conditionalAccess: "Ticket or purchase required",
    routeUnknown: "Walking time unavailable",
  },
  "zh-CN": {
    matched: "所选步行范围内",
    farther: "更远的选择",
    otherNearby: "其他附近厕所",
    conditionalAccess: "需门票或消费",
    routeUnknown: "步行时间暂不可用",
  },
};
function initialLanguage(): Language {
  try {
    return localStorage.getItem("readytogo-language") === "zh-CN"
      ? "zh-CN"
      : "en";
  } catch {
    return "en";
  }
}
function initialPreference(): Preference {
  try {
    return localStorage.getItem("readytogo-preference") === "seated_required"
      ? "seated_required"
      : "any";
  } catch {
    return "any";
  }
}
function walk(c: Candidate, zh: boolean) {
  if (
    c.routeStatus !== "success" ||
    c.walkSeconds === null ||
    c.walkMeters === null
  )
    return zh ? "步行时间暂不可用" : "Walking time unavailable";
  const minutes = Math.max(1, Math.ceil(c.walkSeconds / 60));
  const distance =
    c.walkMeters >= 1000
      ? `${(c.walkMeters / 1000).toFixed(1)} km`
      : `${Math.round(c.walkMeters)} m`;
  return `${minutes} ${zh ? "分钟" : "min"} · ${distance}`;
}
export function ToiletCard({
  candidate: c,
  language,
}: {
  candidate: Candidate;
  language: Language;
}) {
  const zh = language === "zh-CN";
  const seat = {
    documented: zh ? "资料记载有坐便" : "Seated toilet listed",
    inferred: zh ? "可能有坐便" : "May have a seated toilet",
    unknown: zh ? "坐便信息未知" : "Seated toilet information unknown",
    unavailable: zh ? "无成人坐便线索" : "Adult seated toilet not available",
  }[c.seatStatus];
  return (
    <article className="toilet-card">
      <div className="card-top">
        <span
          className={`badge ${c.seatStatus === "inferred" || c.seatStatus === "documented" ? "positive" : ""}`}
        >
          {seat}
        </span>
        <strong className="walk-time">{walk(c, zh)}</strong>
      </div>
      <h3>
        {!zh && c.nameEn ? (
          <>
            {c.nameEn}
            <small>{c.nameZh}</small>
          </>
        ) : (
          c.nameZh
        )}
      </h3>
      <p className="address">{c.addressZh || c.district}</p>
      <p>{c.reason}</p>
      <div className="card-foot">
        <span>
          {c.openingHoursRaw ||
            (zh ? "营业时间未提供" : "Opening hours not listed")}
        </span>
        <span>
          {c.sources
            .map((s) => s.name)
            .filter((x, i, a) => a.indexOf(x) === i)
            .join(" · ")}
        </span>
      </div>
    </article>
  );
}
export default function App() {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const zh = language === "zh-CN";
  const [preference, setPreference] = useState<Preference>(initialPreference);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [picker, setPicker] = useState(false);
  const [walkLimitMinutes, setWalkLimit] = useState<10 | 20>(10);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showOthers, setShowOthers] = useState(false);
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("readytogo-language", language);
    } catch {}
  }, [language]);
  useEffect(() => {
    try {
      localStorage.setItem("readytogo-preference", preference);
    } catch {}
  }, [preference]);
  useEffect(() => () => controller.current?.abort(), []);
  function select(p: Place) {
    setOrigin({ ...p.position, label: p.nameZh, source: "place" });
    setPicker(false);
    setResult(null);
  }
  async function run(cursor: string | null = null, retry = false) {
    if (!origin) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const queryVersion = ++version.current;
    const request: SearchRequest = {
      origin,
      context: "nearby",
      preference,
      walkLimitMinutes,
      includeConditionalAccess: false,
      extendedRadiusKm: 5,
      language,
      queryVersion,
      cursor,
      retry,
    };
    setLoading(true);
    setError("");
    if (!cursor) setResult(null);
    const oldResult = cursor ? result : null;
    const until = Date.now() + 35000;
    try {
      do {
        const reply = await searchToilets(request, abort.signal);
        if (version.current !== queryVersion) return;
        const next = reply.data;
        if (oldResult) {
          for (const key of Object.keys(next.groups) as Array<
            keyof SearchResult["groups"]
          >)
            next.groups[key] = [
              ...new Map(
                [...oldResult.groups[key], ...next.groups[key]].map((c) => [
                  c.toiletId,
                  c,
                ]),
              ).values(),
            ];
        }
        setResult(next);
        request.retry = false;
        if (!next.pendingWork) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } while (Date.now() < until && !abort.signal.aborted);
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Search unavailable");
    } finally {
      if (version.current === queryVersion) setLoading(false);
    }
  }
  useEffect(() => {
    controller.current?.abort();
    version.current++;
    setLoading(false);
    setResult(null);
    setError("");
  }, [origin, preference, walkLimitMinutes, language]);
  const total = result
    ? Object.values(result.groups).reduce((n, g) => n + g.length, 0)
    : 0;
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" aria-label="ReadytoGo home">
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          ReadytoGo<span className="city-tag">BEIJING</span>
        </a>
        <button
          className="language-toggle"
          onClick={() => setLanguage(zh ? "en" : "zh-CN")}
        >
          {zh ? "English" : "中文"}
        </button>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">
            {zh ? "北京旅行，从容出发" : "A COMFORTABLE WAY TO EXPLORE"}
          </div>
          <h1>
            {zh ? (
              <>
                自在逛北京。
                <br />
                随时，安心停靠。
              </>
            ) : (
              <>
                Beijing, at ease.
                <br />
                Find your comfort stop.
              </>
            )}
          </h1>
          <p>
            {zh
              ? "真实地点、步行路线与设施线索，帮你找到下一处厕所。"
              : "Real places, walking routes and facility details for your next toilet stop."}
          </p>
        </section>
        <section className="finder-layout">
          <aside className="search-panel">
            <span className="step-label">
              01 / {zh ? "你的起点" : "YOUR STARTING POINT"}
            </span>
            <h2>{zh ? "从哪里出发？" : "Where are you?"}</h2>
            <button className="origin-control" onClick={() => setPicker(true)}>
              <span aria-hidden="true">⌖</span>
              <span>
                <strong>
                  {origin?.label ||
                    (zh ? "选择北京地点" : "Choose a Beijing place")}
                </strong>
                <small>
                  {origin
                    ? zh
                      ? "点击更换起点"
                      : "Change starting point"
                    : zh
                      ? "景点、车站或入口"
                      : "Attraction, station or entrance"}
                </small>
              </span>
              <span aria-hidden="true">↗</span>
            </button>
            <fieldset>
              <legend>{zh ? "厕所需求" : "What do you need?"}</legend>
              <label
                className={`choice ${preference === "any" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="preference"
                  checked={preference === "any"}
                  onChange={() => setPreference("any")}
                />
                <span>{zh ? "无特殊要求" : "No preference"}</span>
              </label>
              <label
                className={`choice ${preference === "seated_required" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="preference"
                  checked={preference === "seated_required"}
                  onChange={() => setPreference("seated_required")}
                />
                <span>{zh ? "需要坐便" : "Seated toilet needed"}</span>
              </label>
            </fieldset>
            <fieldset>
              <legend>
                {zh ? "愿意步行多久？" : "How far would you walk?"}
              </legend>
              <div className="segment">
                {([10, 20] as const).map((n) => (
                  <button
                    key={n}
                    className={walkLimitMinutes === n ? "active" : ""}
                    onClick={() => setWalkLimit(n)}
                    aria-pressed={walkLimitMinutes === n}
                  >
                    {n} {zh ? "分钟" : "min"}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              className="primary find-button"
              disabled={!origin || loading}
              onClick={() => void run()}
            >
              {loading
                ? zh
                  ? "正在查找…"
                  : "Finding options…"
                : zh
                  ? "找附近厕所"
                  : "Find a toilet"}
              <span aria-hidden="true">→</span>
            </button>
            <p className="fine-print">
              {zh
                ? "来源包括北京公厕台账与高德地图。未知设施会如实标注。"
                : "Using Beijing facility records and Amap. Missing details stay unknown."}
            </p>
          </aside>
          <div className="results-panel" aria-live="polite">
            <div className="results-heading">
              <div>
                <span className="step-label">
                  02 / {zh ? "比较选择" : "YOUR OPTIONS"}
                </span>
                <h2>{zh ? "下一处安心停靠" : "Your next comfort stop"}</h2>
              </div>
              {result && <span className="result-count">{total}</span>}
            </div>
            {origin && (
              <p className="origin-caption">
                {zh ? "计算起点：" : "Walking from: "}
                {origin.label}
              </p>
            )}
            {error && (
              <div className="notice error">
                <p>{error}</p>
                <button
                  className="secondary"
                  onClick={() => void run(null, true)}
                >
                  {zh ? "重试" : "Try again"}
                </button>
              </div>
            )}
            {loading && !result && (
              <div className="empty-state">
                <div className="spinner" />
                <h3>{zh ? "正在查询真实路线" : "Checking walking routes"}</h3>
                <p>
                  {zh
                    ? "附近候选将分批显示。"
                    : "Nearby options will appear as they become available."}
                </p>
              </div>
            )}
            {!result && !loading && !error && (
              <div className="empty-state">
                <span className="empty-symbol" aria-hidden="true">
                  ⌖
                </span>
                <h3>{zh ? "先选一个起点" : "A good place to start"}</h3>
                <p>
                  {zh
                    ? "选择你所在的景点或街道，我们来查询附近厕所。"
                    : "Choose where you are, then compare nearby toilets and their walking routes."}
                </p>
                <button className="secondary" onClick={() => setPicker(true)}>
                  {zh ? "选择起点" : "Choose a starting point"}
                </button>
              </div>
            )}
            {result && (
              <>
                {result.status === "partial" && (
                  <p className="notice">
                    {zh
                      ? "已显示可用结果，部分路线暂未取得。"
                      : "Available options are shown. Some routes are not ready."}
                  </p>
                )}
                {!total && (
                  <div className="empty-state">
                    <h3>
                      {zh ? "当前范围没有候选" : "No options in this range"}
                    </h3>
                    <p>{result.summary}</p>
                    <button
                      className="secondary"
                      onClick={() => setWalkLimit(20)}
                    >
                      {zh ? "扩大到20分钟" : "Try 20 minutes"}
                    </button>
                  </div>
                )}
                {(
                  Object.keys(result.groups) as Array<
                    keyof SearchResult["groups"]
                  >
                ).map((key) => {
                  const list = result.groups[key].filter(
                    (c) => showOthers || !c.ordinaryAlternative,
                  );
                  if (!list.length) return null;
                  if (key === "otherNearby" && !showOthers)
                    return (
                      <button
                        className="secondary"
                        key={key}
                        onClick={() => setShowOthers(true)}
                      >
                        {zh ? "查看其他附近厕所" : "Show other nearby toilets"}{" "}
                        ({list.length})
                      </button>
                    );
                  return (
                    <section className="result-group" key={key}>
                      <h3 className="group-title">{names[language][key]}</h3>
                      {list.map((c) => (
                        <ToiletCard
                          key={c.toiletId}
                          candidate={c}
                          language={language}
                        />
                      ))}
                    </section>
                  );
                })}
                {result.hasMore && (
                  <button
                    className="secondary load-more"
                    disabled={loading}
                    onClick={() => void run(result.nextCursor)}
                  >
                    {loading
                      ? zh
                        ? "加载中…"
                        : "Loading…"
                      : zh
                        ? "加载更多"
                        : "Load more options"}
                  </button>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <footer>
        {zh
          ? "ReadytoGo · 北京双语如厕助手"
          : "ReadytoGo · A bilingual toilet finder for Beijing"}
      </footer>
      {picker && (
        <PlacePicker
          language={language}
          onSelect={select}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  );
}
