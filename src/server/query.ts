import { createHash, randomUUID } from "node:crypto";
import type {
  Candidate,
  CandidateGroups,
  Origin,
  SearchRequest,
  SearchResult,
  Toilet,
  Route,
  GroupName,
} from "../shared/contracts.js";
import { Catalog, distanceMeters } from "./data/catalog.js";
import { limits } from "./config.js";
import { AppError } from "./errors.js";
import type { AmapProvider } from "./providers/amap.js";
export const emptyGroups = (): CandidateGroups => ({
  matched: [],
  farther: [],
  otherNearby: [],
  conditionalAccess: [],
  routeUnknown: [],
});
interface QuerySession {
  id: string;
  key: string;
  created: number;
  toilets: Toilet[];
  warnings: string[];
  batches: Map<number, Batch>;
  ready: Promise<void>;
  upstreamFailure: boolean;
}
interface Batch {
  candidates: Candidate[];
  done: boolean;
  ready: Promise<void>;
}
export class QueryService {
  private sessions = new Map<string, QuerySession>();
  private keys = new Map<string, string>();
  private routes = new Map<
    string,
    { until: number; promise: Promise<Route> }
  >();
  constructor(
    readonly catalog: Catalog,
    readonly provider: AmapProvider,
    private now: () => Date = () => new Date(),
  ) {}
  async route(
    origin: Origin,
    destination: NonNullable<Toilet["position"]>,
    retry = false,
  ): Promise<Route> {
    const key = JSON.stringify([
      origin.lng,
      origin.lat,
      origin.crs,
      destination.lng,
      destination.lat,
      destination.crs,
      "walking",
    ]);
    const existing = this.routes.get(key);
    if (existing && existing.until > Date.now()) {
      const route = await existing.promise;
      if (!retry || route.status === "success") return route;
    }
    const promise = this.provider
      .walking(origin, destination)
      .catch(() => ({
        origin,
        destination,
        status: "provider_error" as const,
        walkSeconds: null,
        walkMeters: null,
      }));
    this.routes.set(key, { until: Date.now() + limits.routeCacheMs, promise });
    return promise;
  }
  private key(request: SearchRequest) {
    const { queryVersion: _v, cursor: _c, retry: _r, ...conditions } = request;
    return createHash("sha256")
      .update(JSON.stringify(conditions))
      .digest("hex");
  }
  private async recall(s: QuerySession, r: SearchRequest) {
    const ordinary = limits.ordinaryRadiusMeters[r.walkLimitMinutes];
    const radius =
      r.preference === "seated_required" ? r.extendedRadiusKm * 1000 : ordinary;
    const found = new Map(
      this.catalog.nearby(r.origin, radius).map((t) => [t.id, t]),
    );
    let hadProviderSuccess = false;
    // Ordinary and expanded retrieval are separate so near ordinary options are retained.
    const radii =
      r.preference === "seated_required" ? [ordinary, radius] : [ordinary];
    for (const searchRadius of radii) {
      try {
        const page = await this.provider.nearbyToilets(
          r.origin,
          searchRadius,
          1,
        );
        hadProviderSuccess = true;
        for (const poi of page.pois) {
          const t = this.catalog.integrate(poi);
          found.set(t.id, t);
        }
        if (page.hasMore && found.size < limits.maxCandidates) {
          const second = await this.provider.nearbyToilets(
            r.origin,
            searchRadius,
            2,
          );
          for (const poi of second.pois) {
            const t = this.catalog.integrate(poi);
            found.set(t.id, t);
          }
        }
      } catch {
        s.warnings.push(
          "Some map candidates are unavailable. Existing results are still usable.",
        );
        s.upstreamFailure = true;
      }
    }
    // Resolve a bounded number of nearby local records; never label their unknown CRS as GCJ02.
    const unresolved = this.catalog
      .unresolvedNearby(r.origin, radius)
      .filter(
        (t) =>
          r.preference === "any" ||
          t.seatStatus === "inferred" ||
          t.seatStatus === "documented",
      )
      .slice(0, 4);
    await Promise.all(
      unresolved.map(async (local) => {
        try {
          const hits = await this.provider.searchPlaces(
            `${local.nameZh} ${local.district}`,
            { toiletsOnly: true, limit: 5 },
          );
          hadProviderSuccess = true;
          for (const poi of hits.pois) {
            const t = this.catalog.integrate(poi);
            if (t.position && distanceMeters(r.origin, t.position) <= radius)
              found.set(t.id, t);
          }
        } catch {
          s.upstreamFailure = true;
        }
      }),
    );
    const all = [...found.values()].filter(
      (t) =>
        this.catalog.get(t.id) &&
        t.position &&
        distanceMeters(r.origin, t.position) <= radius &&
        t.availability !== "permanently_closed" &&
        t.accessCondition !== "restricted",
    );
    all.sort(
      (a, b) =>
        distanceMeters(r.origin, a.position!) -
          distanceMeters(r.origin, b.position!) || a.id.localeCompare(b.id),
    );
    if (r.preference === "seated_required") {
      const seated = all.filter(
        (t) => t.seatStatus === "documented" || t.seatStatus === "inferred",
      );
      const ordinaryOptions = all.filter(
        (t) =>
          t.seatStatus !== "documented" &&
          t.seatStatus !== "inferred" &&
          distanceMeters(r.origin, t.position!) <= ordinary,
      );
      s.toilets = [];
      for (
        let i = 0;
        i < Math.max(seated.length, ordinaryOptions.length);
        i++
      ) {
        if (seated[i]) s.toilets.push(seated[i]);
        if (ordinaryOptions[i]) s.toilets.push(ordinaryOptions[i]);
      }
    } else s.toilets = all;
    s.toilets = s.toilets.slice(0, limits.maxCandidates);
    if (!hadProviderSuccess && !s.toilets.length)
      throw new AppError(
        "MAP_UNAVAILABLE",
        "The search service is temporarily unavailable. Please retry.",
        503,
        true,
      );
    void this.catalog.persist();
  }
  private candidate(t: Toilet, r: SearchRequest): Candidate {
    return {
      toiletId: t.id,
      nameZh: t.nameZh,
      nameEn: t.nameEn,
      addressZh: t.addressZh,
      district: t.district,
      position: t.position,
      seatStatus: t.seatStatus,
      seatBasis: t.seatBasis,
      facilities: t.facilities,
      openingStatus: "unknown",
      openingHoursRaw: t.openingHoursRaw,
      accessCondition: t.accessCondition,
      accessNote: t.accessNote,
      routeStatus: "pending",
      walkSeconds: null,
      walkMeters: null,
      straightLineMeters: t.position
        ? distanceMeters(r.origin, t.position)
        : null,
      reason:
        r.language === "en"
          ? "Walking information is being checked."
          : "正在查询步行路线。",
      sources: t.sources,
    };
  }
  private group(c: Candidate, r: SearchRequest): GroupName | null {
    if (c.routeStatus === "unreachable") return null;
    const seated = c.seatStatus === "documented" || c.seatStatus === "inferred";
    let group: Exclude<GroupName, "conditionalAccess">;
    if (c.routeStatus !== "success") {
      group = "routeUnknown";
      c.ordinaryAlternative = r.preference === "seated_required" && !seated;
    } else if (c.walkSeconds! > r.walkLimitMinutes * 60) {
      if (r.preference === "seated_required" && seated) group = "farther";
      else return null;
    } else
      group =
        r.preference === "seated_required" && !seated
          ? "otherNearby"
          : "matched";
    if (
      (c.accessCondition === "ticket_required" ||
        c.accessCondition === "purchase_required") &&
      !r.includeConditionalAccess
    ) {
      c.baseGroup = group;
      return "conditionalAccess";
    }
    return group;
  }
  async search(
    r: SearchRequest,
  ): Promise<{ data: SearchResult; warnings: string[] }> {
    const key = this.key(r);
    let offset = 0;
    let session: QuerySession | undefined;
    for (const [id, s] of this.sessions)
      if (Date.now() - s.created > limits.queryCacheMs) {
        this.sessions.delete(id);
        if (this.keys.get(s.key) === id) this.keys.delete(s.key);
      }
    if (r.cursor) {
      try {
        const cursor = JSON.parse(
          Buffer.from(r.cursor, "base64url").toString(),
        ) as { id: string; offset: number };
        session = this.sessions.get(cursor.id);
        offset = cursor.offset;
        if (
          !session ||
          session.key !== key ||
          !Number.isInteger(offset) ||
          offset < 0 ||
          offset % limits.routeBatchSize !== 0 ||
          offset >= session.toilets.length
        )
          throw new Error();
      } catch {
        throw new AppError(
          "INVALID_CURSOR",
          "Search settings changed or this page expired. Start a new search.",
          400,
          false,
        );
      }
    } else if (!r.retry) {
      const id = this.keys.get(key);
      if (id) session = this.sessions.get(id);
    }
    if (!session) {
      session = {
        id: randomUUID(),
        key,
        created: Date.now(),
        toilets: [],
        warnings: [],
        batches: new Map(),
        ready: Promise.resolve(),
        upstreamFailure: false,
      };
      this.sessions.set(session.id, session);
      this.keys.set(key, session.id);
      session.ready = this.recall(session, r);
    }
    await session.ready;
    let batch = session.batches.get(offset);
    if (!batch) {
      const rows = session.toilets.slice(
        offset,
        offset + limits.routeBatchSize,
      );
      batch = {
        candidates: rows.map((t) => this.candidate(t, r)),
        done: false,
        ready: Promise.resolve(),
      };
      session.batches.set(offset, batch);
      const activeBatch = batch;
      activeBatch.ready = (async () => {
        let finished = false;
        const routes = Promise.all(
          activeBatch.candidates.map(async (c) => {
            if (!c.position) return;
            const route = await this.route(
              r.origin,
              c.position,
              Boolean(r.retry),
            );
            if (finished) return;
            c.routeStatus = route.status;
            c.walkSeconds = route.walkSeconds;
            c.walkMeters = route.walkMeters;
            c.reason =
              r.language === "en"
                ? c.seatStatus === "inferred"
                  ? "Facility records suggest a seated toilet may be available."
                  : c.seatStatus === "documented"
                    ? "A seated toilet is listed in the source."
                    : "Compare the walking route and available facility information."
                : c.seatStatus === "inferred"
                  ? "设施资料表明这里可能有坐便。"
                  : c.seatStatus === "documented"
                    ? "资料记载这里有坐便。"
                    : "请结合步行路线和已有设施资料选择。";
          }),
        );
        let timeout: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          routes,
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, limits.batchTimeoutMs);
          }),
        ]);
        if (timeout) clearTimeout(timeout);
        finished = true;
        for (const c of activeBatch.candidates)
          if (c.routeStatus === "pending") {
            c.routeStatus = "provider_error";
            c.walkSeconds = null;
            c.walkMeters = null;
          }
        activeBatch.done = true;
      })();
    }
    await Promise.race([
      batch.ready,
      new Promise((r) => setTimeout(r, limits.firstResponseWaitMs)),
    ]);
    const groups = emptyGroups();
    for (const raw of batch.candidates) {
      const c = { ...raw };
      const group = this.group(c, r);
      if (group) groups[group].push(c);
    }
    for (const list of Object.values(groups))
      list.sort(
        (a, b) =>
          (a.walkSeconds ?? Infinity) - (b.walkSeconds ?? Infinity) ||
          (a.walkMeters ?? Infinity) - (b.walkMeters ?? Infinity) ||
          (a.straightLineMeters ?? Infinity) -
            (b.straightLineMeters ?? Infinity) ||
          a.toiletId.localeCompare(b.toiletId),
      );
    const count = Object.values(groups).reduce((n, g) => n + g.length, 0);
    const partial =
      !batch.done ||
      session.upstreamFailure ||
      batch.candidates.some((c) => c.routeStatus === "provider_error");
    const hasMore = offset + limits.routeBatchSize < session.toilets.length;
    return {
      data: {
        status: partial ? "partial" : count ? "complete" : "empty",
        queryVersion: r.queryVersion,
        origin: r.origin,
        groups,
        analysisStatus: "fallback",
        summary:
          r.language === "en"
            ? partial
              ? "Available results are shown. Some information could not be completed."
              : count
                ? "Compare nearby toilet options."
                : "No candidates within the selected range. Try a wider range or another starting point."
            : partial
              ? "已显示可用结果，部分信息暂未完成。"
              : count
                ? "比较附近厕所候选。"
                : "当前范围没有候选，请扩大范围或更换起点。",
        pendingWork: !batch.done,
        hasMore,
        nextCursor: hasMore
          ? Buffer.from(
              JSON.stringify({
                id: session.id,
                offset: offset + limits.routeBatchSize,
              }),
            ).toString("base64url")
          : null,
      },
      warnings: [...new Set(session.warnings)],
    };
  }
}
