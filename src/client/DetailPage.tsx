import { useEffect, useState } from "react";
import type {
  Candidate,
  Facilities,
  Language,
  Origin,
  Toilet,
} from "../shared/contracts";
import { getToilet } from "./api";
import { Navigation } from "./Navigation";
import { StaticMap } from "./StaticMap";
import "./wayfinding.css";
const facilityNames: Record<keyof Facilities, [string, string]> = {
  maleStalls: ["Male stalls", "男厕厕位"],
  femaleStalls: ["Female stalls", "女厕厕位"],
  unisexStalls: ["Unisex stalls", "通用厕位"],
  thirdRestroom: ["Third restroom", "第三卫生间"],
  accessibility: ["Accessibility facilities", "无障碍设施"],
  accessibleRoom: ["Accessible room", "无障碍厕间"],
  allAccessible: ["All accessible", "全无障碍"],
  accessibleStalls: ["Accessible stalls", "无障碍厕位"],
  managementRoom: ["Management room", "管理间"],
  washroom: ["Washroom", "盥洗间"],
  adultSeated: ["Adult seated toilet", "成人坐便"],
  childSeatedOnly: ["Child seated toilet only", "仅儿童坐便"],
  notes: ["Facility notes", "设施备注"],
};
export function DetailPage({
  toiletId,
  candidate,
  origin,
  language,
  onBack,
  onPhrases,
}: {
  toiletId: string;
  candidate?: Candidate;
  origin: Origin | null;
  language: Language;
  onBack: () => void;
  onPhrases?: () => void;
}) {
  const zh = language === "zh-CN";
  const [toilet, setToilet] = useState<Toilet | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [showMap, setShowMap] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setToilet(null);
    getToilet(toiletId, language, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setToilet(r.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [toiletId, language, retry]);
  const facts = toilet ?? candidate;
  const seat = facts
    ? {
        documented: zh ? "资料记载有坐便" : "Seated toilet listed",
        inferred: zh ? "可能有坐便" : "May have a seated toilet",
        unknown: zh ? "坐便信息未知" : "Seated toilet information unknown",
        unavailable: zh ? "无成人坐便" : "Adult seated toilet unavailable",
      }[facts.seatStatus]
    : "";
  const access = facts
    ? {
        public: zh ? "公众可进入" : "Public access",
        ticket_required: zh ? "需要门票" : "Ticket required",
        purchase_required: zh ? "需要消费" : "Purchase required",
        restricted: zh ? "限制进入" : "Restricted access",
        unknown: zh ? "进入条件未提供" : "Access details not listed",
      }[facts.accessCondition]
    : "";
  const areaNames = new Set<string>();
  if (facts) {
    if ((facts.facilities.maleStalls ?? 0) > 0)
      areaNames.add(zh ? "男厕区域" : "Men's area");
    if ((facts.facilities.femaleStalls ?? 0) > 0)
      areaNames.add(zh ? "女厕区域" : "Women's area");
    if ((facts.facilities.unisexStalls ?? 0) > 0)
      areaNames.add(zh ? "通用区域" : "Unisex area");
    for (const source of facts.sources) {
      const code = source.rawFields.typeCode;
      const wording = [source.rawFields.type, source.rawFields.name]
        .filter((v) => typeof v === "string")
        .join(" ");
      if (code === "200301" || /男(?:厕|洗手间|卫生间)/.test(wording))
        areaNames.add(zh ? "男厕区域" : "Men's area");
      if (code === "200302" || /女(?:厕|洗手间|卫生间)/.test(wording))
        areaNames.add(zh ? "女厕区域" : "Women's area");
      if (/男女通用|无性别|通用(?:厕|卫生间)/.test(wording))
        areaNames.add(zh ? "通用区域" : "Unisex area");
    }
  }
  const mapDescriptions =
    facts?.sources
      .filter((s) => s.provider === "amap")
      .flatMap((s) => {
        const name =
          typeof s.rawFields.name === "string" ? s.rawFields.name : "";
        const address =
          typeof s.rawFields.address === "string" ? s.rawFields.address : "";
        return name &&
          (name !== facts.nameZh || (address && address !== facts.addressZh))
          ? [{ name, address }]
          : [];
      }) ?? [];
  return (
    <main className="detail-page">
      <button className="page-back" onClick={onBack}>
        ← {zh ? "返回结果" : "Back to results"}
      </button>
      {error && (
        <p className="notice error" role="alert">
          {zh
            ? "详细资料暂不可用，已有信息仍可使用。"
            : "Full details are unavailable. You can still use the information below."}{" "}
          <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
            {zh ? "重试" : "Retry"}
          </button>
        </p>
      )}
      {!facts ? (
        <div className="empty-state" role="status">
          {error
            ? zh
              ? "找不到此厕所，请返回结果重新选择。"
              : "This toilet could not be found. Return to the results and select again."
            : zh
              ? "正在加载详情…"
              : "Loading details…"}
        </div>
      ) : (
        <>
          <div className="eyebrow">{zh ? "厕所详情" : "TOILET DETAILS"}</div>
          <h1>{!zh && facts.nameEn ? facts.nameEn : facts.nameZh}</h1>
          {!zh && facts.nameEn && <p className="detail-name">{facts.nameZh}</p>}
          <div className="detail-layout">
            <section className="detail-panel">
              <span
                className={`badge ${facts.seatStatus === "documented" || facts.seatStatus === "inferred" ? "positive" : ""}`}
              >
                {seat}
              </span>
              <div className="detail-row">
                <h2>{zh ? "推荐说明" : "Why this option"}</h2>
                <p>
                  {candidate?.reason ||
                    (facts.seatStatus === "documented"
                      ? zh
                        ? "原始资料记载有成人坐便。"
                        : "The source lists an adult seated toilet."
                      : facts.seatStatus === "inferred"
                        ? zh
                          ? "设施资料中有坐便线索，供选择时参考。"
                          : "Facility records contain clues that a seated toilet may be available."
                        : zh
                          ? "根据地址、路线和已有设施资料选择。"
                          : "Compare the address, route and available facility information.")}
                </p>
                {facts.seatBasis.length > 0 && (
                  <p>{facts.seatBasis.join("；")}</p>
                )}
              </div>
              <div className="detail-row">
                <h2>{zh ? "中文名称和地址" : "Chinese name & address"}</h2>
                <p tabIndex={0} className="navigation-copy">
                  {facts.nameZh}
                  <br />
                  {facts.addressZh || facts.district}
                </p>
              </div>
              {mapDescriptions.length > 0 && (
                <div className="detail-row">
                  <h2>
                    {zh ? "地图名称与入口提示" : "Map name & entrance details"}
                  </h2>
                  {mapDescriptions.map((info, i) => (
                    <p key={i}>
                      {info.name}
                      {info.address && (
                        <>
                          <br />
                          {info.address}
                        </>
                      )}
                    </p>
                  ))}
                </div>
              )}
              <div className="detail-row">
                <h2>{zh ? "开放与进入" : "Opening & access"}</h2>
                <p>
                  {facts.openingHoursRaw ||
                    (zh ? "营业时间未提供" : "Opening hours not listed")}
                </p>
                <p>{access}</p>
                {facts.accessNote && <p>{facts.accessNote}</p>}
              </div>
              <div className="detail-row">
                <h2>{zh ? "设施资料" : "Facility information"}</h2>
                {areaNames.size > 0 && (
                  <p className="area-information">
                    {zh ? "适用区域" : "Area information"}:{" "}
                    {[...areaNames].join(" · ")}
                  </p>
                )}
                <div className="detail-facilities">
                  {Object.entries(facts.facilities)
                    .filter(([, v]) => v !== null)
                    .map(([key, value]) => (
                      <span className="badge" key={key}>
                        {facilityNames[key as keyof Facilities][zh ? 1 : 0]}:{" "}
                        {typeof value === "boolean"
                          ? value
                            ? zh
                              ? "有"
                              : "Yes"
                            : zh
                              ? "无"
                              : "No"
                          : String(value)}
                      </span>
                    ))}
                </div>
                {Object.values(facts.facilities).every((v) => v === null) && (
                  <p>{zh ? "设施详情未提供" : "Facility details not listed"}</p>
                )}
              </div>
              <div className="detail-row">
                <h2>{zh ? "信息来源" : "Sources"}</h2>
                {facts.sources.length ? (
                  <ul className="source-list">
                    {facts.sources.map((source, i) => (
                      <li key={i}>
                        {source.name}
                        {source.provider === "amap"
                          ? " · 高德地图 Amap"
                          : zh
                            ? " · 北京公厕资料"
                            : " · Beijing public toilet records"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{zh ? "来源名称未提供" : "Source name not listed"}</p>
                )}
              </div>
              <div className="inline-actions">
                {facts.position && (
                  <button
                    className="text-link"
                    aria-expanded={showMap}
                    onClick={() => setShowMap((v) => !v)}
                  >
                    {showMap
                      ? zh
                        ? "收起地图"
                        : "Hide map"
                      : zh
                        ? "查看地图位置"
                        : "Show on map"}
                  </button>
                )}
                {onPhrases && (
                  <button className="text-link" onClick={onPhrases}>
                    {zh ? "打开双语询问卡" : "Open bilingual phrase cards"}
                  </button>
                )}
              </div>
              {showMap && facts.position && (
                <div className="detail-map">
                  <StaticMap
                    center={facts.position}
                    language={language}
                    markers={[
                      {
                        id: toiletId,
                        position: facts.position,
                        label: facts.nameZh,
                        number: 1,
                      },
                    ]}
                    selectedId={toiletId}
                  />
                </div>
              )}
            </section>
            <Navigation
              toiletId={toiletId}
              origin={origin}
              language={language}
            />
          </div>
        </>
      )}
    </main>
  );
}
