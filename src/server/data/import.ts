import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import { availabilityFromStatements } from "../rules.js";
import type {
  CatalogFile,
  Facilities,
  SourcePosition,
  Toilet,
} from "../../shared/contracts.js";

const columns = [
  "序号",
  "厕所名称",
  "所在区县",
  "所在街道乡镇",
  "作业保洁单位",
  "厕所编号",
  "地址",
  "经度",
  "纬度",
  "建设方式",
  "类别",
  "农村公厕",
  "冲洗方式",
  "除臭方式",
  "指标状况",
  "男坑位数",
  "女坑位数",
  "无性别坑位数",
  "第三卫生间",
  "有无障碍设施",
  "无障碍厕所间",
  "全部实现无障碍公厕",
  "无障碍厕位",
  "管理间",
  "盥洗室",
  "粪便处理方式",
  "备注",
];
function value(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  return /^(?:|\/|—|-|暂无|不详|null)$/i.test(s) ? null : s;
}
function number(raw: string | undefined): number | null {
  const s = value(raw);
  if (s === null || !/^\d+(?:\.\d+)?$/.test(s)) return null;
  return Number(s);
}
function bool(raw: string | undefined): boolean | null {
  const s = value(raw);
  return /^(有|是|1|true)$/i.test(s || "")
    ? true
    : /^(无|否|没有|0|false)$/i.test(s || "")
      ? false
      : null;
}
function countOrFlag(raw: string | undefined): number | boolean | null {
  return number(raw) ?? bool(raw);
}
function coordinate(raw: string | undefined): number | null {
  const s = value(raw)
    ?.replace(/[ＥＥ]/g, "E")
    .trim();
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(
    /^(?:[NE北东]\s*)?(\d{2,3})\s*[°度]\s*(\d{1,2})\s*['′’分]\s*(\d{1,2}(?:\.\d+)?)\s*["″”秒]?(?:\s*[NE北东])?$/i,
  );
  if (!m || Number(m[2]) >= 60 || Number(m[3]) >= 60) return null;
  return (
    Math.round((Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600) * 1e8) /
    1e8
  );
}
function position(row: string[]): SourcePosition | null {
  let lng = coordinate(row[7]);
  let lat = coordinate(row[8]);
  if (
    lng !== null &&
    lat !== null &&
    lng >= 39 &&
    lng <= 42 &&
    lat >= 115 &&
    lat <= 118
  )
    [lng, lat] = [lat, lng];
  // The source covers Beijing. An implausible value is kept only as raw source text.
  if (
    lng === null ||
    lat === null ||
    lng < 115 ||
    lng > 118 ||
    lat < 39 ||
    lat > 42
  )
    return null;
  return { lng, lat, crs: "unknown" };
}
export function emptyFacilities(): Facilities {
  return {
    maleStalls: null,
    femaleStalls: null,
    unisexStalls: null,
    thirdRestroom: null,
    accessibility: null,
    accessibleRoom: null,
    allAccessible: null,
    accessibleStalls: null,
    managementRoom: null,
    washroom: null,
    adultSeated: null,
    childSeatedOnly: null,
    notes: null,
  };
}
export function initialSeat(
  f: Facilities,
): Pick<Toilet, "seatStatus" | "seatBasis"> {
  if (f.adultSeated === false || f.childSeatedOnly === true)
    return {
      seatStatus: "unavailable",
      seatBasis: [
        f.childSeatedOnly ? "资料只记载儿童坐便" : "资料明确没有成人坐便",
      ],
    };
  if (f.adultSeated === true)
    return { seatStatus: "documented", seatBasis: ["资料明确记载成人坐便"] };
  const basis: string[] = [];
  if (
    f.thirdRestroom === true ||
    (typeof f.thirdRestroom === "number" && f.thirdRestroom > 0)
  )
    basis.push("资料记载第三卫生间");
  if (
    f.accessibleRoom === true ||
    (typeof f.accessibleRoom === "number" && f.accessibleRoom > 0)
  )
    basis.push("资料记载无障碍厕所间");
  if (
    f.accessibleStalls === true ||
    (typeof f.accessibleStalls === "number" && f.accessibleStalls > 0)
  )
    basis.push("资料记载无障碍厕位");
  return {
    seatStatus: basis.length ? "inferred" : "unknown",
    seatBasis: basis,
  };
}
export async function importCsv(
  input: string,
  output: string,
): Promise<CatalogFile> {
  const rows = parse(iconv.decode(await readFile(input), "gb18030"), {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as string[][];
  const toilets = new Map<string, Toilet>();
  const report: CatalogFile["report"] = {
    inputFile: basename(input),
    inputRecords: 0,
    importedCount: 0,
    mergedCount: 0,
    skippedCount: 0,
    parsedPositionCount: 0,
    usablePositionCount: 0,
    anomalies: {},
    sampleToiletIds: [],
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!/^\d+$/.test((row[0] || "").trim())) continue;
    report.inputRecords++;
    const name = value(row[1]);
    if (!name) {
      report.skippedCount++;
      continue;
    }
    const sourcePosition = position(row);
    const district = value(row[2]) || "";
    const addressZh = value(row[6]) || "";
    const f: Facilities = {
      ...emptyFacilities(),
      maleStalls: number(row[15]),
      femaleStalls: number(row[16]),
      unisexStalls: number(row[17]),
      thirdRestroom: countOrFlag(row[18]),
      accessibility: bool(row[19]),
      accessibleRoom: countOrFlag(row[20]),
      allAccessible: bool(row[21]),
      accessibleStalls: countOrFlag(row[22]),
      managementRoom: bool(row[23]),
      washroom: bool(row[24]),
      notes: value(row[26]),
    };
    const identity = JSON.stringify([
      name,
      district,
      addressZh,
      sourcePosition ?? row.slice(1),
    ]);
    const id = `bj_${createHash("sha256").update(identity).digest("hex").slice(0, 20)}`;
    const source: Toilet["sources"][number] = {
      provider: "beijing_csv",
      name: "北京市公厕台账",
      fileName: basename(input),
      rowNumber: i + 1,
      governmentId: value(row[5]),
      rawFields: Object.fromEntries(
        columns.map((key, j) => [key, value(row[j])]),
      ),
    };
    const existing = toilets.get(id);
    if (existing) {
      existing.sources.push(source);
      report.mergedCount++;
      continue;
    }
    const availability = availabilityFromStatements(
      [row[14] || "", f.notes || ""],
      row[14]?.trim() === "现有" ? "active" : "unknown",
    );
    toilets.set(id, {
      id,
      nameZh: name,
      nameEn: null,
      addressZh,
      district,
      position: null,
      sourcePosition,
      positionSource: null,
      poiId: null,
      matchMethod: null,
      facilities: f,
      ...initialSeat(f),
      openingHoursRaw: null,
      accessCondition: "unknown",
      accessNote: null,
      availability,
      sources: [source],
    });
    if (sourcePosition) report.parsedPositionCount++;
    else
      report.anomalies.invalidOrMissingPosition =
        (report.anomalies.invalidOrMissingPosition || 0) + 1;
  }
  report.importedCount = toilets.size;
  report.sampleToiletIds = [...toilets.keys()].slice(0, 10);
  const catalog: CatalogFile = {
    schemaVersion: 1,
    report,
    toilets: [...toilets.values()],
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(catalog));
  return catalog;
}
