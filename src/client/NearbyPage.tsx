import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import type {
  Candidate,
  CandidateGroups,
  Language,
  Origin,
  Place,
  Preference,
  SearchRequest,
  SearchResult,
  QuerySettings,
} from "../shared/contracts";
import { searchToilets } from "./api";
import { mergeSearchPages } from "../shared/searchResults";
import { sameToilet } from "../shared/plan";
import { PlacePicker } from "./PlacePicker";
import { ToiletCard } from "./ToiletCard";
const groupNames = {
  en: {
    matched: "Within your walking time",
    farther: "Beyond your walking time",
    otherNearby: "Other nearby toilets",
    conditionalAccess: "Ticket or purchase required",
    routeUnknown: "Walking time unavailable",
  },
  "zh-CN": {
    matched: "所选步行范围内",
    farther: "超出所选步行范围",
    otherNearby: "其他附近厕所",
    conditionalAccess: "需门票或消费",
    routeUnknown: "步行时间暂不可用",
  },
};
export interface NearbyMapProps {
  origin: Origin;
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  language: Language;
}
export interface NearbyPageProps {
  language: Language;
  origin: Origin | null;
  onOriginChange: (origin: Origin) => void;
  preference: Preference;
  onPreferenceChange: (preference: Preference) => void;
  active?: boolean;
  settings?: QuerySettings;
  onSettingsChange?: (patch: Partial<QuerySettings>) => void;
  onDetails?: (candidate: Candidate, origin: Origin) => void;
  onNavigate?: (candidate: Candidate, origin: Origin) => void;
  MapComponent?: ComponentType<NearbyMapProps>;
  LocateComponent?: ComponentType<{
    language: Language;
    onSelect: (origin: Origin) => void;
    auto?: boolean;
  }>;
}
function initialAccess() {
  try {
    return localStorage.getItem("readytogo-conditional") === "true";
  } catch {
    return false;
  }
}
function originIdentity(origin: Origin | null) {
  return (
    origin && [
      origin.lng,
      origin.lat,
      origin.crs,
      origin.label,
      origin.source,
      origin.accuracyMeters ?? null,
    ]
  );
}
export function NearbyPage({
  language,
  origin,
  onOriginChange,
  preference,
  onPreferenceChange,
  active = true,
  settings,
  onSettingsChange,
  onDetails,
  onNavigate,
  MapComponent,
  LocateComponent,
}: NearbyPageProps) {
  const zh = language === "zh-CN";
  const [picker, setPicker] = useState(false);
  const [localWalk, setLocalWalk] = useState<10 | 20>(10);
  const [localRadius, setLocalRadius] = useState<5 | 10>(5);
  const [localConditional, setLocalConditional] = useState(initialAccess);
  const walkLimitMinutes = settings?.walkLimitMinutes ?? localWalk;
  const extendedRadiusKm = settings?.extendedRadiusKm ?? localRadius;
  const includeConditionalAccess =
    settings?.includeConditionalAccess ?? localConditional;
  const setWalkLimit = (value: 10 | 20) => {
    if (value === walkLimitMinutes) return;
    cancel();
    if (onSettingsChange) onSettingsChange({ walkLimitMinutes: value });
    else setLocalWalk(value);
  };
  const setRadius = (value: 5 | 10) => {
    if (value === extendedRadiusKm) return;
    cancel();
    if (onSettingsChange) onSettingsChange({ extendedRadiusKm: value });
    else setLocalRadius(value);
  };
  const setConditional = (value: boolean) => {
    if (value === includeConditionalAccess) return;
    cancel();
    if (onSettingsChange) onSettingsChange({ includeConditionalAccess: value });
    else setLocalConditional(value);
  };
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [waitStopped, setWaitStopped] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedId, setSelected] = useState<string | null>(null);
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pages = useRef(new Map<string, SearchResult>());
  const languageRefresh = useRef<{
    keys: string[];
    index: number;
    cursor: string | null;
  } | null>(null);
  const searched = useRef(false);
  const resultRef = useRef(result);
  resultRef.current = result;
  const selectionKey = JSON.stringify([
    originIdentity(origin),
    preference,
    walkLimitMinutes,
    extendedRadiusKm,
    includeConditionalAccess,
  ]);
  const conditionKey = JSON.stringify([selectionKey, language]);
  const previousSelectionKey = useRef(selectionKey);
  const currentKey = useRef(conditionKey);
  currentKey.current = conditionKey;
  const cancel = useCallback(() => {
    version.current++;
    controller.current?.abort();
    setLoading(false);
  }, []);
  const run = useCallback(
    async (
      cursor: string | null = null,
      retry = false,
      preserveResults = false,
    ) => {
      if (!origin || !active) return;
      cancel();
      searched.current = true;
      const queryVersion = ++version.current;
      const key = conditionKey;
      const abort = new AbortController();
      controller.current = abort;
      const refresh = languageRefresh.current;
      const request: SearchRequest = {
        origin,
        context: "nearby",
        preference,
        walkLimitMinutes,
        includeConditionalAccess,
        extendedRadiusKm,
        language,
        queryVersion,
        cursor: refresh ? refresh.cursor : cursor,
        retry,
      };
      setLoading(true);
      setError("");
      setWaitStopped(false);
      if (!cursor && !refresh) {
        pages.current.clear();
        if (!retry && !preserveResults) setResult(null);
      }
      const deadline = Date.now() + 130_000;
      try {
        while (!abort.signal.aborted) {
          const response = await searchToilets(request, abort.signal);
          if (
            version.current !== queryVersion ||
            currentKey.current !== key ||
            response.data.queryVersion !== queryVersion
          )
            return;
          const page = response.data;
          const token = page.batchCursor ?? request.cursor ?? "first";
          const slot =
            refresh?.keys[refresh.index] ??
            [...pages.current].find(
              ([, saved]) => saved.batchCursor === token,
            )?.[0] ??
            token;
          const unrefreshedKeys = new Set(
            refresh?.keys.slice(refresh.index + 1) ?? [],
          );
          const previousPage = pages.current.get(slot);
          pages.current.set(
            slot,
            refresh && page.pendingWork && previousPage
              ? mergeSearchPages(
                  new Map([
                    ["previous", previousPage],
                    ["current", page],
                  ]),
                  page,
                )
              : page,
          );
          const moreLoadedPages =
            !!refresh &&
            !page.pendingWork &&
            refresh.index + 1 < refresh.keys.length &&
            page.hasMore &&
            !!page.nextCursor;
          request.cursor = moreLoadedPages
            ? page.nextCursor
            : (page.batchCursor ?? request.cursor);
          if (refresh) {
            refresh.cursor = request.cursor ?? null;
            if (moreLoadedPages) refresh.index++;
            else if (!page.pendingWork) {
              // Exhaustion can shorten the previously loaded range. Until
              // then, unrefreshed pages stay visible without old explanations.
              for (const key of refresh.keys.slice(refresh.index + 1))
                pages.current.delete(key);
              languageRefresh.current = null;
            }
          }
          setResult(
            mergeSearchPages(
              refresh
                ? new Map(
                    [...pages.current].sort(
                      ([a], [b]) =>
                        Number(unrefreshedKeys.has(b)) -
                        Number(unrefreshedKeys.has(a)),
                    ),
                  )
                : pages.current,
              {
                ...page,
                pendingWork: page.pendingWork || moreLoadedPages,
                analysisStatus: moreLoadedPages
                  ? "pending"
                  : page.analysisStatus,
              },
            ),
          );
          request.retry = false;
          if (!page.pendingWork && !moreLoadedPages) break;
          if (Date.now() >= deadline) {
            setWaitStopped(true);
            break;
          }
          if (moreLoadedPages) continue;
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 500);
            abort.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
        }
      } catch (e) {
        if (!abort.signal.aborted && version.current === queryVersion) {
          setError(
            e instanceof Error
              ? e.message
              : zh
                ? "查询暂不可用"
                : "Search is unavailable.",
          );
          if (preserveResults || refresh)
            setResult((previous) =>
              previous
                ? {
                    ...previous,
                    status: "partial",
                    pendingWork: false,
                    analysisStatus: "fallback",
                  }
                : null,
            );
        }
      } finally {
        if (version.current === queryVersion) setLoading(false);
      }
    },
    [
      origin,
      preference,
      walkLimitMinutes,
      includeConditionalAccess,
      extendedRadiusKm,
      language,
      active,
      conditionKey,
      cancel,
      zh,
    ],
  );
  useEffect(() => {
    const languageOnly = previousSelectionKey.current === selectionKey;
    previousSelectionKey.current = selectionKey;
    cancel();
    setError("");
    if (languageOnly) {
      // Keep the map mounted and the user's selection visible. Source facts
      // remain useful while language-specific descriptions are refreshed.
      const keys = [...pages.current.keys()];
      languageRefresh.current = keys.length
        ? { keys, index: 0, cursor: null }
        : null;
      for (const [key, previous] of pages.current) {
        pages.current.set(key, {
          ...previous,
          summary: "",
          pendingWork: true,
          analysisStatus: "pending",
          batchCursor: undefined,
          nextCursor: null,
          hasMore: false,
          groups: Object.fromEntries(
            Object.entries(previous.groups).map(([group, rows]) => [
              group,
              rows.map((candidate) => ({ ...candidate, reason: "" })),
            ]),
          ) as CandidateGroups,
        });
      }
      const previous = [...pages.current.values()].at(-1);
      setResult(previous ? mergeSearchPages(pages.current, previous) : null);
    } else {
      languageRefresh.current = null;
      pages.current.clear();
      setSelected(null);
      setShowOthers(false);
      setResult(null);
    }
    if (searched.current && origin && active)
      void run(null, false, languageOnly);
  }, [conditionKey]);
  useEffect(() => {
    if (!active) cancel();
    else if (searched.current && origin && !resultRef.current) void run();
    else if (resultRef.current?.pendingWork && searched.current)
      void run(resultRef.current.batchCursor ?? null, false, true);
    return () => {
      version.current++;
      controller.current?.abort();
    };
  }, [active]);
  useEffect(() => {
    if (settings) return;
    try {
      localStorage.setItem(
        "readytogo-conditional",
        String(includeConditionalAccess),
      );
    } catch {}
  }, [includeConditionalAccess, settings]);
  function changeOrigin(value: Origin) {
    if (
      JSON.stringify(originIdentity(value)) ===
      JSON.stringify(originIdentity(origin))
    )
      return;
    cancel();
    onOriginChange(value);
  }
  function select(p: Place) {
    changeOrigin({
      ...p.position,
      label: p.nameZh,
      source:
        p.originType === "map"
          ? "map"
          : p.originType === "geolocation"
            ? "geolocation"
            : "place",
    });
    setPicker(false);
  }
  function changePreference(value: Preference) {
    if (value === preference) return;
    cancel();
    onPreferenceChange(value);
  }
  const ordinaryCount = result
    ? Object.values(result.groups)
        .flat()
        .filter(
          (c) =>
            c.ordinaryAlternative ||
            result.groups.otherNearby.some((o) => o.toiletId === c.toiletId),
        ).length
    : 0;
  const visibleGroups: CandidateGroups = result
    ? (Object.fromEntries(
        Object.entries(result.groups).map(([k, list]) => [
          k,
          list.filter(
            (c) =>
              showOthers || !(c.ordinaryAlternative || k === "otherNearby"),
          ),
        ]),
      ) as CandidateGroups)
    : {
        matched: [],
        farther: [],
        otherNearby: [],
        conditionalAccess: [],
        routeUnknown: [],
      };
  const candidates = Object.values(visibleGroups).flat();
  const visibleSelectedId =
    candidates.find(
      (candidate) => selectedId && sameToilet(candidate, selectedId),
    )?.toiletId ?? selectedId;
  const noMatched =
    result && !result.pendingWork && result.groups.matched.length === 0;
  const selectCandidate = (id: string) => {
    setSelected(id);
    document
      .querySelector(`[data-toilet-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  return (
    <>
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
          {LocateComponent && (
            <LocateComponent language={language} onSelect={changeOrigin} />
          )}
          <fieldset>
            <legend>{zh ? "厕所需求" : "What do you need?"}</legend>
            {(["any", "seated_required"] as const).map((value) => (
              <label
                key={value}
                className={`choice ${preference === value ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="preference"
                  checked={preference === value}
                  onChange={() => changePreference(value)}
                />
                <span>
                  {value === "any"
                    ? zh
                      ? "无特殊要求"
                      : "No preference"
                    : zh
                      ? "需要坐便"
                      : "Seated toilet needed"}
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>{zh ? "愿意步行多久？" : "How far would you walk?"}</legend>
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
          {preference === "seated_required" && (
            <fieldset>
              <legend>
                {zh
                  ? "更远坐便线索的检索范围"
                  : "Search farther for seated-toilet clues"}
              </legend>
              <div className="segment">
                {([5, 10] as const).map((n) => (
                  <button
                    key={n}
                    aria-pressed={extendedRadiusKm === n}
                    className={extendedRadiusKm === n ? "active" : ""}
                    onClick={() => setRadius(n)}
                  >
                    {n} km
                  </button>
                ))}
              </div>
              <p className="fine-print">
                {zh
                  ? "这是直线召回范围，步行时间以真实路线为准。"
                  : "This is a straight-line search radius; walking time comes from the route."}
              </p>
            </fieldset>
          )}
          <label className="choice">
            <input
              type="checkbox"
              checked={includeConditionalAccess}
              onChange={(e) => setConditional(e.target.checked)}
            />
            <span>
              {zh
                ? "包含需门票或消费地点"
                : "Include ticket or purchase access"}
            </span>
          </label>
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
            {result && (
              <span className="result-count">{candidates.length}</span>
            )}
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
                {zh ? "重试查询" : "Retry search"}
              </button>
            </div>
          )}
          {!result && !loading && !error && (
            <div className="empty-state">
              <span className="empty-symbol" aria-hidden="true">
                ⌖
              </span>
              <h3>
                {origin
                  ? zh
                    ? "起点已选好"
                    : "Ready when you are"
                  : zh
                    ? "先选一个起点"
                    : "A good place to start"}
              </h3>
              <p>
                {zh
                  ? "选择起点和需求，查询附近真实候选。"
                  : "Choose a starting point and preference, then find nearby options."}
              </p>
              <button
                className="secondary"
                onClick={() => (origin ? void run() : setPicker(true))}
              >
                {origin
                  ? zh
                    ? "找附近厕所"
                    : "Find a toilet"
                  : zh
                    ? "选择起点"
                    : "Choose a starting point"}
              </button>
            </div>
          )}
          {loading && !result && (
            <div className="empty-state">
              <div className="spinner" />
              <h3>
                {zh
                  ? "正在查询候选与路线"
                  : "Checking places and walking routes"}
              </h3>
              <p>
                {zh ? "已有候选会先显示。" : "Available options appear first."}
              </p>
            </div>
          )}
          {result && (
            <>
              {result.pendingWork && !waitStopped && (
                <p className="notice">
                  {result.analysisStatus === "pending"
                    ? zh
                      ? "正在补充候选分析；现有结果可继续使用。"
                      : "Adding candidate explanations; available results remain usable."
                    : zh
                      ? "正在补充路线；现有结果可继续使用。"
                      : "Checking remaining routes; available results remain usable."}
                </p>
              )}
              {((result.status === "partial" && !result.pendingWork) ||
                waitStopped) && (
                <div className="notice">
                  <p>
                    {waitStopped
                      ? zh
                        ? "等待已结束，可继续使用现有结果或重试。"
                        : "Waiting has ended. Keep using available results or retry."
                      : zh
                        ? "部分信息暂不可用，已保留可用结果。"
                        : "Some information is unavailable. Available results are kept."}
                  </p>
                  <button
                    className="secondary"
                    disabled={loading}
                    onClick={() => void run(null, true)}
                  >
                    {zh ? "重试未完成查询" : "Retry search"}
                  </button>
                </div>
              )}
              {noMatched && (
                <div className="notice">
                  <strong>
                    {result.status === "empty"
                      ? zh
                        ? "本批未找到候选"
                        : "No candidates in this batch"
                      : preference === "seated_required"
                        ? zh
                          ? "没有范围内的坐便推荐"
                          : "No seated-toilet match within your walking time"
                        : zh
                          ? "没有范围内的推荐"
                          : "No match within your walking time"}
                  </strong>
                  <p>{result.summary}</p>
                  <div className="recovery-actions">
                    {walkLimitMinutes === 10 && (
                      <button
                        className="secondary"
                        onClick={() => setWalkLimit(20)}
                      >
                        {zh ? "扩大到20分钟" : "Try 20 minutes"}
                      </button>
                    )}
                    <button
                      className="secondary"
                      onClick={() => setPicker(true)}
                    >
                      {zh ? "更换起点" : "Change starting point"}
                    </button>
                  </div>
                </div>
              )}
              {ordinaryCount > 0 && (
                <button
                  className="secondary ordinary-toggle"
                  aria-expanded={showOthers}
                  onClick={() => setShowOthers(!showOthers)}
                >
                  {showOthers
                    ? zh
                      ? "收起普通厕所"
                      : "Hide ordinary alternatives"
                    : zh
                      ? "查看其他附近厕所"
                      : "Show ordinary alternatives"}{" "}
                  ({ordinaryCount})
                </button>
              )}
              {MapComponent && origin && (
                <div className="view-toggle segment">
                  <button
                    aria-pressed={view === "list"}
                    className={view === "list" ? "active" : ""}
                    onClick={() => setView("list")}
                  >
                    {zh ? "列表" : "List"}
                  </button>
                  <button
                    aria-pressed={view === "map"}
                    className={view === "map" ? "active" : ""}
                    onClick={() => setView("map")}
                  >
                    {zh ? "地图" : "Map"}
                  </button>
                </div>
              )}
              {view === "map" && MapComponent && origin && (
                <MapComponent
                  origin={origin}
                  candidates={candidates}
                  selectedId={visibleSelectedId}
                  onSelect={selectCandidate}
                  language={language}
                />
              )}
              {(Object.keys(visibleGroups) as Array<keyof CandidateGroups>).map(
                (key) =>
                  visibleGroups[key].length ? (
                    <section className="result-group" key={key}>
                      <h3 className="group-title">
                        {groupNames[language][key]}
                      </h3>
                      {visibleGroups[key].map((c) => (
                        <ToiletCard
                          key={c.toiletId}
                          candidate={c}
                          language={language}
                          selected={visibleSelectedId === c.toiletId}
                          onSelect={() => setSelected(c.toiletId)}
                          onDetails={
                            onDetails && origin
                              ? () => onDetails(c, origin)
                              : undefined
                          }
                          onNavigate={
                            onNavigate && origin
                              ? () => onNavigate(c, origin)
                              : undefined
                          }
                        />
                      ))}
                    </section>
                  ) : null,
              )}
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
      {picker && (
        <PlacePicker
          language={language}
          initialPosition={origin ?? undefined}
          onSelect={select}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  );
}
