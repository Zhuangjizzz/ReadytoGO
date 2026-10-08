import type {
  Candidate,
  Facilities,
  Language,
  OpeningStatus,
  SearchRequest,
  Source,
  Toilet,
} from "../shared/contracts.js";
const positive = (value: unknown) =>
  value === true ||
  (typeof value === "number" && value > 0) ||
  (typeof value === "string" && /^(有|是|[1-9]\d*)$/.test(value.trim()));
const seatWord = "(?:成人(?:可用)?的?)?(?:坐便器?|座便器?|马桶)";
export function seatInfo(
  f: Facilities,
  sources: Source[] = [],
  prior?: Pick<Toilet, "seatStatus" | "seatBasis" | "seatConflict">,
): Pick<Toilet, "seatStatus" | "seatBasis" | "seatConflict"> {
  const texts = [f.notes, ...sources.map((s) => s.rawFields["备注"])].filter(
    (s): s is string => typeof s === "string",
  );
  const notes = [...new Set(texts)].join("；");
  const factualNotes = notes
    .split(/[，,；。;.!?]/)
    .filter(
      (clause) =>
        !/(?:未提供|没有|无|缺少|暂无)[^；。]{0,12}(?:信息|资料|记录|说明)/.test(
          clause,
        ),
    )
    .join("；");
  const negative = new RegExp(
    `(?:没有|无|未设(?:置)?|未配备|不设(?:置)?|不配备|不提供)${seatWord}|${seatWord}(?:数量)?[：:\\s]*(?:为)?(?:0|零)(?!\\d)(?:个)?|no (?:adult )?(?:seated toilets?|sit[- ]down toilets?)`,
    "i",
  );
  const childrenOnly =
    /(?:仅|只有|只设|仅设|only)[^；。;.!?]{0,12}(?:儿童|幼儿|child)|(?:儿童|幼儿)[^；。;.!?]{0,10}(?:专用|only)/i.test(
      notes,
    ) || f.childSeatedOnly === true;
  const denied = negative.test(factualNotes) || f.adultSeated === false;
  // Remove clauses that assert absence or only child use before looking for positives.
  const positiveText = factualNotes
    .split(/[，,；。;.!?]/)
    .filter(
      (s) =>
        !negative.test(s) &&
        (!/(?:儿童|幼儿|child)/i.test(s) || /成人|adult/i.test(s)) &&
        !/(?:仅|只有|只设|仅设)[^，,]{0,10}(?:儿童|幼儿)|未提供.*信息|信息.*未知/.test(
          s,
        ),
    )
    .join("；");
  const listed =
    f.adultSeated === true ||
    new RegExp(
      `(?:有|设有|配有|配备|提供)${seatWord}|${seatWord}(?:数量)?[：:\\s]*(?:[1-9]\\d*)个|(?:adult )?(?:seated|sit[- ]down) toilets? (?:available|provided)`,
      "i",
    ).test(positiveText);
  if (listed && (denied || childrenOnly))
    return {
      seatStatus: "unknown",
      seatConflict: true,
      seatBasis: ["资料中的成人坐便记载存在冲突，请查看原始说明。"],
    };
  if (denied || childrenOnly)
    return {
      seatStatus: "unavailable",
      seatConflict: false,
      seatBasis: [
        childrenOnly
          ? "资料仅记载儿童坐便，不能作为成人坐便。"
          : "资料明确记载没有成人坐便。",
      ],
    };
  if (listed)
    return {
      seatStatus: "documented",
      seatConflict: false,
      seatBasis: ["资料明确记载成人可用的坐便。"],
    };
  const basis: string[] = [];
  const values = (key: keyof Facilities, rawKey: string) =>
    positive(f[key]) || sources.some((s) => positive(s.rawFields[rawKey]));
  if (values("thirdRestroom", "第三卫生间")) basis.push("资料记载第三卫生间");
  if (values("accessibleRoom", "无障碍厕所间"))
    basis.push("资料记载无障碍厕所间");
  if (values("accessibleStalls", "无障碍厕位"))
    basis.push("资料记载无障碍厕位");
  if (basis.length)
    return { seatStatus: "inferred", seatBasis: basis, seatConflict: false };
  return prior ?? { seatStatus: "unknown", seatBasis: [] };
}
export function deriveToilet(t: Toilet): Toilet {
  const notes = [
    t.facilities.notes,
    ...t.sources.map((s) => s.rawFields["备注"]),
  ]
    .filter((x) => typeof x === "string")
    .join("；");
  let accessCondition = t.accessCondition;
  let accessNote = t.accessNote;
  if (
    /不对外开放|不(?:允许|对)游客(?:开放|使用)?|谢绝游客|仅供内部|仅限内部|staff only|not open to visitors/i.test(
      notes,
    )
  ) {
    accessCondition = "restricted";
    accessNote = notes;
  } else if (
    /需(?:要)?(?:购买)?门票|凭票|持票|购票后|ticket required|admission required/i.test(
      notes,
    )
  ) {
    accessCondition = "ticket_required";
    accessNote = notes;
  } else if (
    /需(?:要)?消费|消费后|仅限顾客|仅供顾客|purchase required|customers only/i.test(
      notes,
    )
  ) {
    accessCondition = "purchase_required";
    accessNote = notes;
  } else if (
    /免费对外开放|游客可用|公众可用|向公众开放|open to (?:the )?public/i.test(
      notes,
    )
  ) {
    accessCondition = "public";
    accessNote = notes;
  }
  const permanent = /永久关闭|已撤销|已拆除|permanently closed/i.test(notes);
  return {
    ...t,
    ...seatInfo(t.facilities, t.sources, {
      seatStatus: t.seatStatus,
      seatBasis: t.seatBasis,
      seatConflict: t.seatConflict,
    }),
    accessCondition,
    accessNote,
    availability: permanent ? "permanently_closed" : t.availability,
  };
}
export function openingStatus(raw: string | null, now: Date): OpeningStatus {
  if (!raw) return "unknown";
  const text = raw.normalize("NFKC").trim();
  if (
    /节假日|节日|冬季|夏季|季节|另行通知|预约|以现场|holiday|season/i.test(text)
  )
    return "unknown";
  if (/^(?:24小时|全天(?:开放)?|24\s*hours?|24\/7)$/i.test(text))
    return "expected_open";
  const matches = [
    ...text.matchAll(/(\d{1,2}):(\d{2})\s*[-–—~～至]\s*(\d{1,2}):(\d{2})/g),
  ];
  if (!matches.length) return "unknown";
  const ranges = matches.map((m) => ({
    start: Number(m[1]) * 60 + Number(m[2]),
    end: Number(m[3]) * 60 + Number(m[4]),
    valid:
      Number(m[1]) < 24 &&
      Number(m[3]) <= 24 &&
      Number(m[2]) < 60 &&
      Number(m[4]) < 60 &&
      (Number(m[3]) < 24 || Number(m[4]) === 0),
  }));
  if (ranges.some((r) => !r.valid || r.start === r.end)) return "unknown";
  const remainder = text
    .replace(/\d{1,2}:\d{2}\s*[-–—~～至]\s*\d{1,2}:\d{2}/g, "")
    .trim();
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  let allowed: number[] = [0, 1, 2, 3, 4, 5, 6];
  const week = remainder.match(
    /(?:周|星期)([一二三四五六日天])\s*[-–—~～至]\s*(?:周|星期)?([一二三四五六日天])/,
  );
  if (week) {
    const start = days.indexOf(week[1].replace("天", "日"));
    const end = days.indexOf(week[2].replace("天", "日"));
    allowed = [];
    for (let d = start; ; d = (d + 1) % 7) {
      allowed.push(d);
      if (d === end) break;
    }
  } else if (/周|星期|mon|tue|wed|thu|fri|sat|sun/i.test(remainder))
    return "unknown";
  const cleaned = remainder
    .replace(week?.[0] ?? "", "")
    .replace(/每天|每日|营业时间|开放时间|[\s,，;；:：()（）]/g, "");
  if (cleaned) return "unknown";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    parts.find((p) => p.type === "weekday")?.value ?? "",
  );
  const current = hour * 60 + minute;
  const open = ranges.some((r) =>
    r.end > r.start
      ? allowed.includes(day) && current >= r.start && current < r.end
      : (allowed.includes(day) && current >= r.start) ||
        (allowed.includes((day + 6) % 7) && current < r.end),
  );
  return open ? "expected_open" : "expected_closed";
}
export function eligible(t: Toilet, r: SearchRequest, now: Date): boolean {
  return (
    t.availability !== "permanently_closed" &&
    t.accessCondition !== "restricted" &&
    (r.context === "plan_stop" ||
      openingStatus(t.openingHoursRaw, now) !== "expected_closed")
  );
}
export function ruleReason(c: Candidate, language: Language): string {
  const zh = language === "zh-CN";
  const sentence =
    c.seatStatus === "documented"
      ? zh
        ? "资料记载有成人坐便。"
        : "An adult seated toilet is listed in the source."
      : c.seatStatus === "inferred"
        ? zh
          ? "设施资料提供坐便线索，可能有成人坐便。"
          : "Facility records suggest an adult seated toilet may be available."
        : c.seatStatus === "unavailable"
          ? zh
            ? "资料不支持成人坐便，作为普通厕所备选。"
            : "Source details do not support an adult seated toilet; this is an ordinary alternative."
          : zh
            ? "坐便信息未知，请结合其他设施和路线选择。"
            : "Seated toilet information is unknown; compare the available facilities and route.";
  return (
    sentence +
    (c.accessCondition === "ticket_required"
      ? zh
        ? "进入可能需要门票。"
        : " A ticket is required for access."
      : c.accessCondition === "purchase_required"
        ? zh
          ? "进入可能需要消费。"
          : " Access requires a purchase."
        : "")
  );
}
