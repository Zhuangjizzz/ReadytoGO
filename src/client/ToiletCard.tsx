import type { Candidate, Language } from "../shared/contracts";
export function ToiletCard({
  candidate: c,
  language,
  selected = false,
  onSelect,
  onDetails,
  onNavigate,
}: {
  candidate: Candidate;
  language: Language;
  selected?: boolean;
  onSelect?: () => void;
  onDetails?: () => void;
  onNavigate?: () => void;
}) {
  const zh = language === "zh-CN";
  const seat = {
    documented: zh ? "资料记载有坐便" : "Seated toilet listed",
    inferred: zh ? "可能有坐便" : "May have a seated toilet",
    unknown: zh ? "坐便信息未知" : "Seated toilet information unknown",
    unavailable: zh ? "成人坐便不可用" : "Adult seated toilet unavailable",
  }[c.seatStatus];
  const route =
    c.routeStatus === "success" &&
    c.walkSeconds !== null &&
    c.walkMeters !== null;
  const distance = (m: number) =>
    m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  const opening =
    c.openingStatus === "expected_open"
      ? zh
        ? "预计开放"
        : "Expected open"
      : c.openingStatus === "expected_closed"
        ? zh
          ? "预计当前关闭"
          : "Expected closed now"
        : zh
          ? "开放信息未知"
          : "Opening status unknown";
  return (
    <article
      className={`toilet-card ${selected ? "is-selected" : ""}`}
      data-toilet-id={c.toiletId}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onSelect?.();
        }
      }}
    >
      <div className="card-top">
        <span
          className={`badge ${["inferred", "documented"].includes(c.seatStatus) ? "positive" : ""}`}
        >
          {seat}
        </span>
        <strong className="walk-time">
          {route
            ? `${Math.max(1, Math.ceil(c.walkSeconds! / 60))} ${zh ? "分钟" : "min"} · ${distance(c.walkMeters!)}`
            : zh
              ? "步行时间暂不可用"
              : "Walking time unavailable"}
        </strong>
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
      {!route && c.straightLineMeters !== null && (
        <p className="straight-line">
          {zh ? "直线距离" : "Straight-line distance"} ·{" "}
          {distance(c.straightLineMeters)}
        </p>
      )}
      <p>{c.reason}</p>
      {c.seatConflict && (
        <p className="notice">
          {zh
            ? "坐便资料存在冲突，详情保留原始说明。"
            : "Seated-toilet records conflict. Check the source details."}
        </p>
      )}
      {["ticket_required", "purchase_required"].includes(c.accessCondition) && (
        <p className="access-note">
          {c.accessCondition === "ticket_required"
            ? zh
              ? "需门票"
              : "Ticket required"
            : zh
              ? "需消费"
              : "Purchase required"}
          {c.accessNote ? ` · ${c.accessNote}` : ""}
        </p>
      )}
      <div className="card-foot">
        <span>
          {opening}
          {c.openingHoursRaw ? ` · ${c.openingHoursRaw}` : ""}
        </span>
        <span>
          {c.sources
            .map((s) => s.name)
            .filter((x, i, a) => a.indexOf(x) === i)
            .join(" · ")}
        </span>
      </div>
      {(onDetails || onNavigate) && (
        <div className="card-actions">
          {onDetails && (
            <button
              className="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onDetails();
              }}
            >
              {zh ? "查看详情" : "Details"}
            </button>
          )}
          {onNavigate && (
            <button
              className="primary"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate();
              }}
            >
              {zh ? "导航" : "Navigate"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
