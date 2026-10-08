import { AppError } from "../errors.js";
import { limits } from "../config.js";
import type { Position, Route } from "../../shared/contracts.js";
export interface ProviderPoi {
  id: string;
  name: string;
  address: string;
  district: string;
  city: string;
  position: Position;
  typeCode: string;
  type: string;
  openingHours: string | null;
}
export interface ResolvedLocation {
  adcode: string;
  address: string;
  district: string;
  city: string;
}
export interface AmapProvider {
  reverseGeocode?(position: Position): Promise<ResolvedLocation>;
  searchPlaces(
    query: string,
    options?: { toiletsOnly?: boolean; page?: number; limit?: number },
  ): Promise<{ pois: ProviderPoi[]; hasMore: boolean }>;
  nearbyToilets(
    origin: Position,
    radiusMeters: number,
    page?: number,
  ): Promise<{ pois: ProviderPoi[]; hasMore: boolean }>;
  walking(origin: Position, destination: Position): Promise<Route>;
  convertGps(position: { lng: number; lat: number }): Promise<Position>;
}
function text(value: unknown): string {
  return typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : "";
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function position(value: unknown): Position | null {
  const [lng, lat] = text(value).split(",").map(Number);
  return Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
    ? { lng, lat, crs: "GCJ02" }
    : null;
}
function pois(value: unknown): ProviderPoi[] {
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    const raw = object(item);
    const p = position(raw.location);
    if (!p || !text(raw.id) || !text(raw.name)) return [];
    const business = object(raw.business);
    return [
      {
        id: text(raw.id),
        name: text(raw.name),
        address: text(raw.address),
        district: text(raw.adname),
        city: text(raw.cityname),
        position: p,
        typeCode: text(raw.typecode),
        type: text(raw.type),
        openingHours:
          text(business.opentime_week) || text(business.opentime_today) || null,
      },
    ];
  });
}
const coordinateString = (p: { lng: number; lat: number }) =>
  `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
export class AmapHttpProvider implements AmapProvider {
  private active = 0;
  private waiting: Array<() => void> = [];
  private nextStartAt = 0;
  constructor(
    private options: {
      key: string;
      baseUrl?: string;
      timeoutMs?: number;
      startIntervalMs?: number;
    },
  ) {}
  private async request(
    path: string,
    params: Record<string, string | number>,
  ): Promise<Record<string, unknown>> {
    if (!this.options.key)
      throw new AppError(
        "MAP_NOT_CONFIGURED",
        "Map service is not configured.",
        503,
        true,
      );
    const waitMs = Math.max(0, this.nextStartAt - Date.now());
    if (waitMs > limits.batchTimeoutMs)
      throw new AppError(
        "MAP_BUSY",
        "Map service is busy. Please retry.",
        503,
        true,
      );
    this.nextStartAt =
      Date.now() +
      waitMs +
      (this.options.startIntervalMs ?? limits.providerStartIntervalMs);
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    if (this.active >= limits.providerConcurrency)
      await new Promise<void>((resolve, reject) => {
        const next = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          this.waiting = this.waiting.filter((x) => x !== next);
          reject(
            new AppError(
              "MAP_BUSY",
              "Map service is busy. Please retry.",
              503,
              true,
            ),
          );
        }, this.options.timeoutMs ?? limits.providerTimeoutMs);
        this.waiting.push(next);
      });
    else this.active++;
    try {
      const url = new URL(
        path,
        this.options.baseUrl || "https://restapi.amap.com",
      );
      url.search = new URLSearchParams({
        ...Object.fromEntries(
          Object.entries(params).map(([k, v]) => [k, String(v)]),
        ),
        key: this.options.key,
      }).toString();
      const response = await fetch(url, {
        signal: AbortSignal.timeout(
          this.options.timeoutMs ?? limits.providerTimeoutMs,
        ),
      });
      if (!response.ok)
        throw new AppError(
          "MAP_UNAVAILABLE",
          "Map service is temporarily unavailable.",
          503,
          true,
        );
      const data = object(await response.json());
      if (data.status !== "1") {
        console.warn(
          JSON.stringify({
            event: "map_provider_error",
            infocode: /^\d{5}$/.test(text(data.infocode))
              ? text(data.infocode)
              : "unknown",
            info: /^[A-Z_ \d-]{1,100}$/.test(text(data.info))
              ? text(data.info)
              : "unknown",
          }),
        );
        throw new AppError(
          "MAP_UNAVAILABLE",
          "Map service could not complete this request.",
          503,
          true,
        );
      }
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "MAP_UNAVAILABLE",
        "Map service is temporarily unavailable.",
        503,
        true,
      );
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
  async searchPlaces(
    query: string,
    options: { toiletsOnly?: boolean; page?: number; limit?: number } = {},
  ) {
    const limit = options.limit ?? 10;
    const raw = await this.request("/v5/place/text", {
      keywords: query,
      region: "北京市",
      city_limit: "true",
      page_size: limit,
      page_num: options.page ?? 1,
      show_fields: "business,indoor",
      ...(options.toiletsOnly ? { types: "200300|200303" } : {}),
    });
    const rows = pois(raw.pois).filter(
      (p) =>
        (p.city === "北京市" || p.city === "北京") &&
        (!options.toiletsOnly || /^20030[0-3]$/.test(p.typeCode)),
    );
    return { pois: rows, hasMore: rows.length === limit };
  }
  async nearbyToilets(origin: Position, radiusMeters: number, page = 1) {
    const raw = await this.request("/v5/place/around", {
      location: coordinateString(origin),
      radius: radiusMeters,
      types: "200300|200303",
      sortrule: "distance",
      page_size: 25,
      page_num: page,
      show_fields: "business,indoor",
    });
    const rows = pois(raw.pois).filter(
      (p) =>
        (p.city === "北京市" || p.city === "北京") &&
        /^20030[0-3]$/.test(p.typeCode),
    );
    return { pois: rows, hasMore: rows.length === 25 };
  }
  async walking(origin: Position, destination: Position): Promise<Route> {
    const base = { origin, destination, walkSeconds: null, walkMeters: null };
    try {
      const raw = await this.request("/v5/direction/walking", {
        origin: coordinateString(origin),
        destination: coordinateString(destination),
        show_fields: "cost",
      });
      const paths = object(raw.route).paths;
      if (!Array.isArray(paths)) return { ...base, status: "provider_error" };
      if (paths.length === 0) return { ...base, status: "unreachable" };
      const path = object(paths[0]);
      const duration = text(object(path.cost).duration);
      const distance = text(path.distance);
      const seconds = Number(duration);
      const meters = Number(distance);
      if (
        duration === "" ||
        distance === "" ||
        !Number.isFinite(seconds) ||
        !Number.isFinite(meters) ||
        seconds < 0 ||
        meters < 0
      )
        return { ...base, status: "provider_error" };
      return {
        origin,
        destination,
        status: "success",
        walkSeconds: seconds,
        walkMeters: meters,
      };
    } catch {
      return { ...base, status: "provider_error" };
    }
  }
  async reverseGeocode(position: Position): Promise<ResolvedLocation> {
    const raw = await this.request("/v3/geocode/regeo", {
      location: coordinateString(position),
      extensions: "base",
    });
    const regeo = object(raw.regeocode);
    const address = object(regeo.addressComponent);
    const adcode = text(address.adcode);
    if (!/^\d{6}$/.test(adcode))
      throw new AppError(
        "MAP_UNAVAILABLE",
        "This location could not be confirmed. Please retry or search for a place.",
        503,
        true,
      );
    return {
      adcode,
      address: text(regeo.formatted_address),
      district: text(address.district),
      city: text(address.city) || text(address.province),
    };
  }
  async convertGps(gps: { lng: number; lat: number }) {
    const raw = await this.request("/v3/assistant/coordinate/convert", {
      locations: coordinateString(gps),
      coordsys: "gps",
    });
    const p = position(raw.locations);
    if (!p)
      throw new AppError(
        "MAP_UNAVAILABLE",
        "Coordinate conversion is unavailable.",
        503,
        true,
      );
    return p;
  }
}
