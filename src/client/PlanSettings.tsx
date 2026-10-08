import type { QuerySettings } from "../shared/contracts";
export function PlanSettings({
  settings,
  onChange,
}: {
  settings: QuerySettings;
  onChange: (patch: Partial<QuerySettings>) => void;
}) {
  const zh = settings.language === "zh-CN";
  return (
    <div className="plan-settings">
      <fieldset>
        <legend>
          {zh ? "全部站点的厕所需求" : "Toilet preference for all stops"}
        </legend>
        <div className="segment">
          {(["any", "seated_required"] as const).map((preference) => (
            <button
              key={preference}
              aria-pressed={settings.preference === preference}
              className={settings.preference === preference ? "active" : ""}
              onClick={() => onChange({ preference })}
            >
              {preference === "any"
                ? zh
                  ? "无特殊要求"
                  : "No preference"
                : zh
                  ? "需要坐便"
                  : "Seated toilet needed"}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{zh ? "步行范围" : "Walking time"}</legend>
        <div className="segment">
          {([10, 20] as const).map((walkLimitMinutes) => (
            <button
              key={walkLimitMinutes}
              aria-pressed={settings.walkLimitMinutes === walkLimitMinutes}
              className={
                settings.walkLimitMinutes === walkLimitMinutes ? "active" : ""
              }
              onClick={() => onChange({ walkLimitMinutes })}
            >
              {walkLimitMinutes} {zh ? "分钟" : "min"}
            </button>
          ))}
        </div>
      </fieldset>
      {settings.preference === "seated_required" && (
        <fieldset>
          <legend>
            {zh
              ? "更远坐便线索的检索范围"
              : "Search farther for seated-toilet clues"}
          </legend>
          <div className="segment">
            {([5, 10] as const).map((extendedRadiusKm) => (
              <button
                key={extendedRadiusKm}
                aria-pressed={settings.extendedRadiusKm === extendedRadiusKm}
                className={
                  settings.extendedRadiusKm === extendedRadiusKm ? "active" : ""
                }
                onClick={() => onChange({ extendedRadiusKm })}
              >
                {extendedRadiusKm} km
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <label className="choice">
        <input
          type="checkbox"
          checked={settings.includeConditionalAccess}
          onChange={(event) =>
            onChange({ includeConditionalAccess: event.target.checked })
          }
        />
        <span>
          {zh ? "包含需门票或消费地点" : "Include ticket or purchase access"}
        </span>
      </label>
    </div>
  );
}
