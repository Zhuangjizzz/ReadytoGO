import { useState } from "react";
import type { Language } from "../shared/contracts";
const phrases = [
  [
    "请问这里有成人可用的坐便器吗？",
    "Is there a seated toilet that an adult can use here?",
  ],
  ["请问厕所现在开放吗？", "Is the toilet open now?"],
  ["请问游客可以使用吗？", "Can visitors use this toilet?"],
  ["请问厕所入口在哪里？", "Where is the toilet entrance?"],
  ["请问有卫生纸吗？", "Is toilet paper available?"],
] as const;
export function PhrasesPage({
  language,
  onBack,
}: {
  language: Language;
  onBack: () => void;
}) {
  const zh = language === "zh-CN";
  const [index, setIndex] = useState<number | null>(null);
  return (
    <main className="phrases-page">
      <button
        className="page-back"
        onClick={() => (index === null ? onBack() : setIndex(null))}
      >
        ←{" "}
        {index === null
          ? zh
            ? "返回"
            : "Back"
          : zh
            ? "全部询问卡"
            : "All phrase cards"}
      </button>
      {index === null ? (
        <>
          <div className="phrases-intro">
            <div className="eyebrow">
              {zh ? "随身双语卡" : "A LITTLE HELP, IN TWO LANGUAGES"}
            </div>
            <h1>{zh ? "让问路更简单。" : "Just show this."}</h1>
            <p>
              {zh
                ? "轻触一句，展示中文大字。也可以横过手机，方便对方阅读。"
                : "Tap a phrase to show it in large Chinese text. Turn your phone sideways for an easy conversation."}
            </p>
          </div>
          <div className="phrases-grid">
            {phrases.map(([chinese, english], i) => (
              <button
                className="phrase-tile"
                key={chinese}
                onClick={() => setIndex(i)}
              >
                <strong lang="zh-CN">{chinese}</strong>
                <span lang="en">{english}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <article className="phrase-card" aria-live="polite">
            <h2 lang="zh-CN">{phrases[index][0]}</h2>
            <p lang="en">{phrases[index][1]}</p>
          </article>
          <div className="phrase-controls">
            <button
              className="secondary"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i! - 1))}
            >
              ← {zh ? "上一句" : "Previous"}
            </button>
            <span className="phrase-position">
              {index + 1} / {phrases.length}
            </span>
            <button
              className="secondary"
              disabled={index === phrases.length - 1}
              onClick={() =>
                setIndex((i) => Math.min(phrases.length - 1, i! + 1))
              }
            >
              {zh ? "下一句" : "Next"} →
            </button>
          </div>
        </>
      )}
    </main>
  );
}
