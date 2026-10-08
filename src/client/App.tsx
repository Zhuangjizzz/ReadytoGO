import { useEffect, useRef, useState } from "react";
import type {
  Candidate,
  Language,
  Origin,
  Preference,
} from "../shared/contracts";
import { NearbyPage } from "./NearbyPage";
import { HomePage } from "./HomePage";
import { MapPanel } from "./MapPanel";
import { DetailPage } from "./DetailPage";
import { PhrasesPage } from "./PhrasesPage";
import { NavigationDialog } from "./NavigationDialog";
import { LocateButton, locate, locationError } from "./LocateButton";
import { usePageNavigation } from "./usePageNavigation";
import { useLocalPlan } from "./useLocalPlan";
import { PlanPage } from "./PlanPage";
export { ToiletCard } from "./ToiletCard";
export default function App() {
  const planController = useLocalPlan();
  const { language, preference } = planController.plan;
  const setLanguage = (language: Language) =>
    planController.changeSettings({ language });
  const setPreference = (preference: Preference) =>
    planController.changeSettings({ preference });
  const [origin, setOrigin] = useState<Origin | null>(null);
  const { path, navigate } = usePageNavigation();
  const lastPlanMode = useRef<"edit" | "results">(
    path === "/plan/result" ? "results" : "edit",
  );
  if (path.startsWith("/plan"))
    lastPlanMode.current = path === "/plan/result" ? "results" : "edit";
  const [nearbyVisited, setNearbyVisited] = useState(path === "/nearby");
  const [detail, setDetail] = useState<{
    candidate: Candidate;
    origin: Origin;
    language: Language;
  } | null>(null);
  const [navigation, setNavigation] = useState<{
    toiletId: string;
    origin: Origin | null;
  } | null>(null);
  const [locationNotice, setLocationNotice] = useState("");
  const locationRequest = useRef<AbortController | null>(null);
  const detailReturn = useRef("/nearby");
  const phrasesReturn = useRef("/");
  const zh = language === "zh-CN";
  function go(next: string) {
    if (next === "/nearby") setNearbyVisited(true);
    setNavigation(null);
    navigate(next);
  }
  function changeOrigin(next: Origin) {
    // A manually selected place always wins over an earlier GPS request.
    locationRequest.current?.abort();
    setLocationNotice("");
    setOrigin(next);
  }
  async function requestLocation() {
    locationRequest.current?.abort();
    const controller = new AbortController();
    locationRequest.current = controller;
    setLocationNotice(
      zh ? "正在取得当前位置…" : "Getting your current location…",
    );
    try {
      const found = await locate(language, controller.signal);
      if (controller.signal.aborted) return;
      setOrigin(found);
      setLocationNotice(
        (found.accuracyMeters ?? 0) > 150
          ? zh
            ? "这是大致位置，可继续查询或修改起点。"
            : "This is an approximate location. Continue or change your starting point."
          : "",
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setLocationNotice(locationError(error, language));
    }
  }
  function startNearby() {
    go("/nearby");
    void requestLocation();
  }
  function showDetails(candidate: Candidate, calculationOrigin: Origin) {
    detailReturn.current = path;
    setDetail({ candidate, origin: calculationOrigin, language });
    go(`/toilets/${encodeURIComponent(candidate.toiletId)}`);
  }
  function showPhrases() {
    phrasesReturn.current = path;
    go("/phrases");
  }
  useEffect(() => {
    if (path === "/nearby") void requestLocation();
    return () => locationRequest.current?.abort();
  }, []);
  useEffect(() => {
    if (path === "/nearby") setNearbyVisited(true);
  }, [path]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  let detailId: string | null = null;
  if (path.startsWith("/toilets/")) {
    try {
      detailId = decodeURIComponent(path.slice("/toilets/".length));
    } catch {
      detailId = "invalid";
    }
  }
  return (
    <>
      <header className="site-header">
        <a
          className="brand"
          href="/"
          aria-label="ReadytoGo home"
          onClick={(e) => {
            e.preventDefault();
            go("/");
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            ↗
          </span>
          ReadytoGo<span className="city-tag">BEIJING</span>
        </a>
        <nav
          className="app-nav"
          aria-label={zh ? "主要导航" : "Main navigation"}
        >
          <button
            className={path === "/nearby" || detailId ? "active" : ""}
            onClick={() => (nearbyVisited ? go("/nearby") : startNearby())}
          >
            {zh ? "找附近" : "Find nearby"}
          </button>
          <button
            className={path.startsWith("/plan") ? "active" : ""}
            onClick={() => go("/plan")}
          >
            {zh ? "规划行程" : "Plan stops"}
          </button>
          <button
            className={path === "/phrases" ? "active" : ""}
            onClick={showPhrases}
          >
            {zh ? "询问卡" : "Phrase cards"}
          </button>
        </nav>
        <button
          className="language-toggle"
          onClick={() => setLanguage(zh ? "en" : "zh-CN")}
        >
          {zh ? "English" : "中文"}
        </button>
      </header>
      {planController.notice && (
        <p className="notice storage-notice" role="status">
          {planController.notice === "version"
            ? zh
              ? "保存的行程版本暂不支持，请重新建立行程。"
              : "Your saved plan uses another version. Start a new plan to continue."
            : planController.notice === "invalid"
              ? zh
                ? "无法恢复保存的行程，请重新建立。"
                : "The saved plan could not be restored. Start a new plan."
              : zh
                ? "本机存储不可用，修改仅保留到关闭页面。"
                : "Storage is unavailable. Changes will last for this visit only."}
        </p>
      )}
      {path === "/" && (
        <HomePage
          language={language}
          onNearby={startNearby}
          onPlan={() => go("/plan")}
          onPhrases={showPhrases}
        />
      )}
      {nearbyVisited && (
        <main className="app-content" hidden={path !== "/nearby"}>
          <section className="nearby-heading">
            <div>
              <div className="eyebrow">
                {zh ? "每一步，轻松一点" : "A LITTLE COMFORT, CLOSE BY"}
              </div>
              <h1>{zh ? "找附近厕所" : "Find a toilet."}</h1>
              <p>
                {zh
                  ? "比较真实步行路线与设施线索。"
                  : "Compare real walking routes and facility details."}
              </p>
            </div>
            <button className="secondary" onClick={showPhrases}>
              {zh ? "需要询问卡？" : "Need a phrase card?"}
            </button>
          </section>
          {locationNotice && (
            <p className="notice" role="status">
              {locationNotice}
            </p>
          )}
          <NearbyPage
            language={language}
            origin={origin}
            onOriginChange={changeOrigin}
            preference={preference}
            onPreferenceChange={setPreference}
            settings={planController.plan}
            onSettingsChange={planController.changeSettings}
            active={path === "/nearby"}
            MapComponent={MapPanel}
            LocateComponent={LocateButton}
            onDetails={showDetails}
            onNavigate={(candidate, calculationOrigin) =>
              setNavigation({
                toiletId: candidate.toiletId,
                origin: calculationOrigin,
              })
            }
          />
        </main>
      )}
      {detailId && (
        <DetailPage
          toiletId={detailId}
          candidate={
            detail?.candidate.toiletId === detailId
              ? detail.candidate
              : undefined
          }
          candidateLanguage={
            detail?.candidate.toiletId === detailId
              ? detail.language
              : undefined
          }
          origin={
            detail?.candidate.toiletId === detailId ? detail.origin : origin
          }
          language={language}
          onBack={() => go(detailReturn.current)}
          onPhrases={showPhrases}
        />
      )}
      {path === "/phrases" && (
        <PhrasesPage
          language={language}
          onBack={() =>
            go(
              phrasesReturn.current === "/phrases"
                ? "/"
                : phrasesReturn.current,
            )
          }
        />
      )}
      <PlanPage
        controller={planController}
        active={path.startsWith("/plan")}
        mode={lastPlanMode.current}
        onResult={() => go("/plan/result")}
        onEdit={() => go("/plan")}
        onDetails={showDetails}
        onNearby={startNearby}
        onNavigate={(candidate, calculationOrigin) =>
          setNavigation({
            toiletId: candidate.toiletId,
            origin: calculationOrigin,
          })
        }
      />
      {navigation && (
        <NavigationDialog
          toiletId={navigation.toiletId}
          origin={navigation.origin}
          language={language}
          onClose={() => setNavigation(null)}
        />
      )}
      <footer className="app-footer">
        {zh
          ? "ReadytoGo · 北京双语如厕助手"
          : "ReadytoGo · A bilingual toilet finder for Beijing"}
      </footer>
    </>
  );
}
