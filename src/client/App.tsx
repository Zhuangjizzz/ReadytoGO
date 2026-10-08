import { useEffect, useState } from "react";
import type { Language, Origin, Preference } from "../shared/contracts";
import { NearbyPage } from "./NearbyPage";
export { ToiletCard } from "./ToiletCard";
function savedLanguage(): Language {
  try {
    return localStorage.getItem("readytogo-language") === "zh-CN"
      ? "zh-CN"
      : "en";
  } catch {
    return "en";
  }
}
function savedPreference(): Preference {
  try {
    return localStorage.getItem("readytogo-preference") === "seated_required"
      ? "seated_required"
      : "any";
  } catch {
    return "any";
  }
}
export default function App() {
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const [preference, setPreference] = useState<Preference>(savedPreference);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const zh = language === "zh-CN";
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
        <NearbyPage
          language={language}
          origin={origin}
          onOriginChange={setOrigin}
          preference={preference}
          onPreferenceChange={setPreference}
        />
      </main>
      <footer>
        {zh
          ? "ReadytoGo · 北京双语如厕助手"
          : "ReadytoGo · A bilingual toilet finder for Beijing"}
      </footer>
    </>
  );
}
