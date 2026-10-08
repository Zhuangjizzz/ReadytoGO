import type { Language } from "../shared/contracts";
export function HomePage({
  language,
  onNearby,
  onPlan,
  onPhrases,
}: {
  language: Language;
  onNearby: () => void;
  onPlan: () => void;
  onPhrases: () => void;
}) {
  const zh = language === "zh-CN";
  return (
    <main className="home-page">
      <section className="home-hero">
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
            ? "真实地点、步行路线与设施线索，让你把时间留给旅途。"
            : "Real places, walking routes and facility details. More time for the trip, less time searching."}
        </p>
      </section>
      <section
        className="home-options"
        aria-label={zh ? "开始使用" : "Get started"}
      >
        <button className="home-option" onClick={onNearby}>
          <span className="home-icon" aria-hidden="true">
            ⌖
          </span>
          <h2>{zh ? "找附近厕所" : "Find a toilet"}</h2>
          <p>
            {zh
              ? "定位或选择一个起点，比较附近选择。"
              : "Use your location or choose a starting point, then compare nearby options."}
          </p>
          <span className="primary">{zh ? "查找附近" : "Find nearby"} ↗</span>
        </button>
        <button className="home-option" onClick={onPlan}>
          <span className="home-icon" aria-hidden="true">
            ↗
          </span>
          <h2>{zh ? "规划景点停靠" : "Plan my stops"}</h2>
          <p>
            {zh
              ? "按你的景点顺序，安排每一站附近的厕所。"
              : "Keep your sightseeing order and find a comfort stop around each attraction."}
          </p>
          <span className="secondary">
            {zh ? "规划行程" : "Plan my stops"} ↗
          </span>
        </button>
      </section>
      <button className="home-phrases" onClick={onPhrases}>
        <span aria-hidden="true">文 / A</span>
        <span>
          <strong>{zh ? "需要当面问一问？" : "Need a little help?"}</strong>
          <small>
            {zh
              ? "五句双语询问卡，打开即可展示。"
              : "Five bilingual phrase cards. Just open and show."}
          </small>
        </span>
        <b aria-hidden="true">→</b>
      </button>
      <p className="home-caption">
        {zh
          ? "无需登录 · 默认英文，可切换中文 · 北京 Demo"
          : "No sign-in · English & Chinese · Beijing demo"}
      </p>
    </main>
  );
}
