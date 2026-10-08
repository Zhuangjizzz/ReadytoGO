import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  CatalogFile,
  Position,
  Source,
  Toilet,
} from "../../shared/contracts.js";
import type { ProviderPoi } from "../providers/amap.js";
import { emptyFacilities, initialSeat } from "./import.js";
import { deriveToilet } from "../rules.js";

export function distanceMeters(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad;
  const dlng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s（）()·,，。]/g, "")
    .replace(/公共卫生间|公共厕所|公厕|卫生间|厕所/g, "");
}

const MATCH_RULE_VERSION = 2;
export type RecordMatchAssistant = (
  poi: ProviderPoi,
  records: Toilet[],
) => Promise<string | null>;
interface AddressParts {
  road: string;
  number: string;
}
function addressParts(value: string, district: string): AddressParts | null {
  const address = normalize(value).replace("北京市", "").replace(district, "");
  const number =
    /(?<![\dA-Za-z])([甲乙丙丁戊己庚辛壬癸]?\d+(?:-\d+)?[A-Za-z]?)(号(?:院)?|弄)/.exec(
      address,
    );
  if (!number || number.index === 0) return null;
  const prefix = address.slice(0, number.index);
  // A preceding district or a second road may qualify the address. The final
  // complete road name is compared exactly, never as a text suffix.
  const roads = prefix.match(/.+?(?:大街|大道|胡同|街|路|巷)/g);
  const road = roads?.at(-1) ?? prefix;
  return {
    road,
    number: `${number[1]}${number[2].startsWith("号") ? "号" : "弄"}`,
  };
}

function roadWithoutHouseNumber(
  value: string,
  district: string,
): string | null {
  return (
    normalize(value)
      .replace("北京市", "")
      .replace(district, "")
      .match(/.+?(?:大街|大道|胡同|街|路|巷)/g)
      ?.at(-1) ?? null
  );
}

interface MatchRow {
  matchRuleVersion: number;
  id: string;
  nameZh: string;
  addressZh: string;
  district: string;
  position: Position;
  poiId: string;
  matchMethod: Toilet["matchMethod"];
  openingHoursRaw: string | null;
  sources: Source[];
}
function validPosition(p: Position | undefined): p is Position {
  return (
    !!p &&
    p.crs === "GCJ02" &&
    Number.isFinite(p.lng) &&
    Number.isFinite(p.lat) &&
    p.lng >= 115 &&
    p.lng <= 118 &&
    p.lat >= 39 &&
    p.lat <= 42
  );
}
export class Catalog {
  readonly toilets = new Map<string, Toilet>();
  private poiIds = new Map<string, string>();
  private persistQueue = Promise.resolve();
  private matchAssistant?: RecordMatchAssistant;
  setMatchAssistant(assistant: RecordMatchAssistant) {
    this.matchAssistant = assistant;
  }
  constructor(
    readonly file: CatalogFile,
    private cachePath: string | null,
  ) {
    for (const t of file.toilets) {
      this.toilets.set(t.id, deriveToilet(t));
      if (t.poiId) this.poiIds.set(t.poiId, t.id);
    }
  }
  async loadMatches() {
    if (!this.cachePath) return;
    try {
      const rows = JSON.parse(
        await readFile(this.cachePath, "utf8"),
      ) as MatchRow[];
      if (!Array.isArray(rows)) return;
      for (const row of rows) {
        if (
          !row ||
          row.matchRuleVersion !== MATCH_RULE_VERSION ||
          !validPosition(row.position) ||
          typeof row.poiId !== "string" ||
          !Array.isArray(row.sources)
        )
          continue;
        const providerSources = row.sources.filter(
          (s) => s.provider === "amap" && s.poiId === row.poiId,
        );
        const existing = this.toilets.get(row.id);
        if (existing) {
          existing.position = row.position;
          existing.positionSource = "amap";
          existing.poiId = row.poiId;
          existing.matchMethod = row.matchMethod;
          existing.openingHoursRaw = row.openingHoursRaw;
          existing.sources = [
            ...existing.sources.filter((s) => s.provider !== "amap"),
            ...providerSources,
          ];
          this.poiIds.set(row.poiId, existing.id);
        } else if (
          typeof row.id === "string" &&
          row.id.startsWith("amap_") &&
          providerSources.length
        ) {
          const raw = providerSources[0].rawFields;
          if (
            typeof raw.typeCode !== "string" ||
            !/^20030[0-3]$/.test(raw.typeCode)
          )
            continue;
          this.integrate({
            id: row.poiId,
            name: row.nameZh,
            address: row.addressZh,
            district: row.district,
            city: "北京市",
            position: row.position,
            typeCode: typeof raw.typeCode === "string" ? raw.typeCode : "",
            type: typeof raw.type === "string" ? raw.type : "",
            openingHours: row.openingHoursRaw,
          });
        }
      }
    } catch {
      /* Corrupt optional location caches must not replace current imported facility data. */
    }
  }
  get(id: string): Toilet | undefined {
    const t = this.toilets.get(id);
    return t ? deriveToilet(t) : undefined;
  }
  nearby(origin: Position, radius: number): Toilet[] {
    return [...this.toilets.values()].filter(
      (t) => t.position && distanceMeters(origin, t.position) <= radius,
    );
  }
  unresolvedNearby(origin: Position, radius: number): Toilet[] {
    return [...this.toilets.values()]
      .filter(
        (t) =>
          !t.position &&
          t.sourcePosition &&
          t.availability !== "permanently_closed" &&
          distanceMeters(origin, t.sourcePosition) <= radius + 800,
      )
      .sort(
        (a, b) =>
          distanceMeters(origin, a.sourcePosition!) -
          distanceMeters(origin, b.sourcePosition!),
      );
  }
  canAssist(poi: ProviderPoi): boolean {
    return !!this.matchAssistant && this.matchCandidates(poi).length > 0;
  }
  private matchCandidates(poi: ProviderPoi): Toilet[] {
    const overlap = (left: string, right: string) => {
      const a = new Set(Array.from(normalize(left)));
      const b = new Set(Array.from(normalize(right)));
      if (a.size < 2 || b.size < 2) return 0;
      return (
        [...a].filter((letter) => b.has(letter)).length /
        Math.max(a.size, b.size)
      );
    };
    return [...this.toilets.values()]
      .filter((t) => {
        if (
          t.poiId ||
          t.id.startsWith("amap_") ||
          !t.district ||
          t.district !== poi.district
        )
          return false;
        const p = t.position ?? t.sourcePosition;
        if (!p || distanceMeters(p, poi.position) > 800) return false;
        const local =
          addressParts(t.addressZh, t.district) ??
          addressParts(t.nameZh, t.district);
        const remote = addressParts(poi.address, poi.district);
        const localRoad =
          local?.road ?? roadWithoutHouseNumber(t.addressZh, t.district);
        const remoteRoad =
          remote?.road ?? roadWithoutHouseNumber(poi.address, poi.district);
        if (localRoad && remoteRoad && localRoad !== remoteRoad) return false;
        if (local && remote && local.number !== remote.number) return false;
        return (
          overlap(t.nameZh, poi.name) >= 0.4 ||
          overlap(t.addressZh, poi.address) >= 0.5
        );
      })
      .sort(
        (a, b) =>
          distanceMeters(a.position ?? a.sourcePosition!, poi.position) -
          distanceMeters(b.position ?? b.sourcePosition!, poi.position),
      )
      .slice(0, 4);
  }
  async integrateWithAssistance(poi: ProviderPoi): Promise<Toilet> {
    const current = this.integrate(poi);
    if (!this.matchAssistant || !current.id.startsWith("amap_")) return current;
    const pool = this.matchCandidates(poi);
    if (!pool.length) return current;
    try {
      const id = await this.matchAssistant(poi, pool);
      const selected = pool.find((t) => t.id === id);
      // An in-flight match may have attached a record elsewhere. Never steal it.
      if (!selected || selected.poiId) return current;
      selected.position = poi.position;
      selected.positionSource = "amap";
      selected.poiId = poi.id;
      selected.matchMethod = "ai_assisted";
      selected.openingHoursRaw = poi.openingHours;
      selected.sources = [
        ...selected.sources,
        ...current.sources.filter((source) => source.provider === "amap"),
      ];
      if (!selected.addressZh) selected.addressZh = poi.address;
      this.toilets.delete(current.id);
      this.toilets.set(selected.id, selected);
      this.poiIds.set(poi.id, selected.id);
      return selected;
    } catch {
      return current;
    }
  }
  integrate(poi: ProviderPoi): Toilet {
    const knownId = this.poiIds.get(poi.id);
    const known = knownId ? this.toilets.get(knownId) : undefined;
    if (known && !known.id.startsWith("amap_")) return known;
    const name = normalize(poi.name);
    const address = normalize(poi.address);
    const candidates = [...this.toilets.values()]
      .filter((t) => !t.poiId && !t.id.startsWith("amap_"))
      .flatMap((t) => {
        if (!t.district || !poi.district || t.district !== poi.district)
          return [];
        const sourcePosition = t.position ?? t.sourcePosition;
        const nearby = sourcePosition
          ? distanceMeters(sourcePosition, poi.position) <= 800
          : false;
        if (sourcePosition && !nearby) return [];
        const n = normalize(t.nameZh);
        const a = normalize(t.addressZh);
        const sameName = name.length >= 2 && n === name;
        const localParts =
          addressParts(t.addressZh, t.district) ??
          addressParts(t.nameZh, t.district);
        const providerParts = addressParts(poi.address, poi.district);
        const localRoad =
          localParts?.road ?? roadWithoutHouseNumber(t.addressZh, t.district);
        const providerRoad =
          providerParts?.road ??
          roadWithoutHouseNumber(poi.address, poi.district);
        if (localRoad && providerRoad && localRoad !== providerRoad) return [];
        if (
          localParts &&
          providerParts &&
          (localParts.number !== providerParts.number ||
            localParts.road !== providerParts.road)
        )
          return [];
        const sameDoor =
          !!localParts &&
          !!providerParts &&
          localParts.number === providerParts.number &&
          localParts.road === providerParts.road;
        const addressAgrees =
          sameDoor || (address.length >= 8 && address === a);
        const namedAddress = address.length >= 8 && n === address;
        const preciseAddress = addressAgrees || namedAddress;
        if (!(sameName && nearby) && !preciseAddress) return [];
        return [
          {
            toilet: t,
            score:
              (sameName ? 4 : 0) +
              (addressAgrees ? 3 : 0) +
              (namedAddress ? 2 : 0) +
              (nearby ? 1 : 0),
            method:
              addressAgrees || namedAddress
                ? ("name_address" as const)
                : ("name_distance" as const),
          },
        ];
      })
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const match =
      best && (!candidates[1] || best.score > candidates[1].score)
        ? best
        : null;
    if (known && !match) return known;
    const facilities = emptyFacilities();
    if (poi.typeCode === "200303") facilities.accessibleRoom = true;
    const t: Toilet = match?.toilet ?? {
      id: `amap_${poi.id}`,
      nameZh: poi.name,
      nameEn: null,
      addressZh: poi.address,
      district: poi.district,
      position: poi.position,
      sourcePosition: null,
      positionSource: "amap",
      poiId: poi.id,
      matchMethod: null,
      facilities,
      ...initialSeat(facilities),
      openingHoursRaw: null,
      accessCondition: "unknown",
      accessNote: null,
      availability: "unknown",
      sources: [],
    };
    t.position = poi.position;
    t.positionSource = "amap";
    t.poiId = poi.id;
    t.matchMethod = match?.method ?? null;
    t.openingHoursRaw = poi.openingHours;
    if (!t.addressZh) t.addressZh = poi.address;
    if (!t.sources.some((s) => s.poiId === poi.id))
      t.sources.push({
        provider: "amap",
        name: "高德地图",
        poiId: poi.id,
        rawFields: {
          name: poi.name,
          address: poi.address,
          district: poi.district,
          type: poi.type,
          typeCode: poi.typeCode,
          openingHours: poi.openingHours,
        },
      });
    if (known && known.id !== t.id) this.toilets.delete(known.id);
    this.toilets.set(t.id, deriveToilet(t));
    this.poiIds.set(poi.id, t.id);
    return t;
  }
  async persist() {
    if (!this.cachePath) return;
    const path = this.cachePath;
    const rows: MatchRow[] = [...this.toilets.values()].flatMap((t) =>
      t.poiId && t.position
        ? [
            {
              matchRuleVersion: MATCH_RULE_VERSION,
              id: t.id,
              nameZh: t.nameZh,
              addressZh: t.addressZh,
              district: t.district,
              position: t.position,
              poiId: t.poiId,
              matchMethod: t.matchMethod,
              openingHoursRaw: t.openingHoursRaw,
              sources: t.sources.filter((s) => s.provider === "amap"),
            },
          ]
        : [],
    );
    const payload = JSON.stringify(rows);
    this.persistQueue = this.persistQueue
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(`${path}.tmp`, payload);
        await rename(`${path}.tmp`, path);
      })
      .catch(() => {});
    await this.persistQueue;
  }
}
