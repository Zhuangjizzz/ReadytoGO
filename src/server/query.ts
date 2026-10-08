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
import type { AmapProvider, ProviderPoi } from "./providers/amap.js";
import { deriveToilet, eligible, openingStatus, ruleReason } from "./rules.js";
export const emptyGroups = (): CandidateGroups => ({
  matched: [],
  farther: [],
  otherNearby: [],
  conditionalAccess: [],
  routeUnknown: [],
});
export type CandidateAnalyzer = (
  candidates: Candidate[],
  request: SearchRequest,
) => Promise<{
  candidates: Candidate[];
  analysisStatus: "complete" | "fallback";
}>;
export interface QueryOptions {
  batchTimeoutMs?: number;
  firstResponseWaitMs?: number;
}
interface Stream {
  radius: number;
  page: number;
  more: boolean;
  failed: boolean;
  fingerprints: Set<string>;
}
interface Batch {
  cursor: string;
  nextCursor: string | null;
  candidates: Candidate[];
  done: boolean;
  preparing: boolean;
  generation: number;
  analysisStatus: "pending" | "complete" | "fallback";
  ready: Promise<void>;
}
interface Session {
  id: string;
  key: string;
  created: number;
  found: Map<string, Toilet>;
  used: Set<string>;
  usedPois: Set<string>;
  assistedPois: Set<string>;
  streams: Stream[];
  batches: Batch[];
  warnings: Set<string>;
  bootstrap: Promise<void>;
  discovery: Promise<void>;
  upstreamSuccess: boolean;
  upstreamFailure: boolean;
}
interface RouteEntry {
  until: number;
  promise: Promise<Route>;
  settled: boolean;
  value?: Route;
}
export class QueryService {
  private sessions = new Map<string, Session>();
  private keys = new Map<string, string>();
  private cursors = new Map<string, { sessionId: string; index: number }>();
  private routes = new Map<string, RouteEntry>();
  private analyzer?: CandidateAnalyzer;
  constructor(
    readonly catalog: Catalog,
    readonly provider: AmapProvider,
    private now: () => Date = () => new Date(),
    private options: QueryOptions = {},
  ) {}
  setCandidateAnalyzer(analyzer: CandidateAnalyzer) {
    this.analyzer = analyzer;
  }
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
    if (
      existing &&
      existing.until > Date.now() &&
      (!retry || !existing.settled || existing.value?.status === "success")
    )
      return existing.promise;
    const fallback: Route = {
      origin,
      destination,
      status: "provider_error",
      walkSeconds: null,
      walkMeters: null,
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = Promise.race([
      this.provider.walking(origin, destination).catch(() => fallback),
      new Promise<Route>((resolve) => {
        timer = setTimeout(
          () => resolve(fallback),
          limits.providerQueueTimeoutMs + limits.providerTimeoutMs,
        );
        timer.unref?.();
      }),
    ]).then((route) => {
      if (timer) clearTimeout(timer);
      if (route.status !== "success")
        return { ...route, walkSeconds: null, walkMeters: null };
      if (
        route.walkSeconds === null ||
        route.walkMeters === null ||
        !Number.isFinite(route.walkSeconds) ||
        !Number.isFinite(route.walkMeters) ||
        route.walkSeconds < 0 ||
        route.walkMeters < 0
      )
        return fallback;
      return route;
    });
    const entry: RouteEntry = {
      until: Date.now() + limits.routeCacheMs,
      promise,
      settled: false,
    };
    this.routes.set(key, entry);
    void promise.then((value) => {
      entry.value = value;
      entry.settled = true;
    });
    return promise;
  }
  private key(r: SearchRequest) {
    return createHash("sha256")
      .update(
        JSON.stringify([
          r.origin.lng,
          r.origin.lat,
          r.origin.crs,
          r.context,
          r.preference,
          r.walkLimitMinutes,
          r.includeConditionalAccess,
          r.preference === "seated_required" ? r.extendedRadiusKm : null,
          r.language,
        ]),
      )
      .digest("hex");
  }
  private radius(r: SearchRequest) {
    return r.preference === "seated_required"
      ? r.extendedRadiusKm * 1000
      : limits.ordinaryRadiusMeters[r.walkLimitMinutes];
  }
  private async add(s: Session, pois: ProviderPoi[], r: SearchRequest) {
    const assistance: Promise<void>[] = [];
    for (const poi of pois) {
      const t = this.catalog.integrate(poi);
      if (t.position && distanceMeters(r.origin, t.position) <= this.radius(r))
        s.found.set(t.id, t);
      if (
        t.id.startsWith("amap_") &&
        this.catalog.canAssist(poi) &&
        s.assistedPois.size < 2 &&
        !s.assistedPois.has(poi.id)
      ) {
        s.assistedPois.add(poi.id);
        assistance.push(
          this.catalog.integrateWithAssistance(poi).then((matched) => {
            if (matched.id !== t.id) s.found.delete(t.id);
            if (
              matched.position &&
              distanceMeters(r.origin, matched.position) <= this.radius(r)
            )
              s.found.set(matched.id, matched);
          }),
        );
      }
    }
    await Promise.all(assistance);
  }
  private async fetchStream(s: Session, stream: Stream, r: SearchRequest) {
    if (!stream.more || stream.page > 8) return;
    try {
      const result = await this.provider.nearbyToilets(
        r.origin,
        stream.radius,
        stream.page,
      );
      s.upstreamSuccess = true;
      stream.failed = false;
      const fingerprint = result.pois
        .map((p) => p.id)
        .sort()
        .join("|");
      const repeated = stream.fingerprints.has(fingerprint);
      stream.fingerprints.add(fingerprint);
      await this.add(s, result.pois, r);
      stream.page++;
      stream.more =
        result.hasMore &&
        !repeated &&
        result.pois.length > 0 &&
        stream.page <= 8;
    } catch {
      stream.failed = true;
      stream.more = false;
      s.upstreamFailure = true;
      s.warnings.add(
        r.language === "en"
          ? "Some map candidates are unavailable. You can retry while keeping existing results."
          : "部分地图候选暂不可用，可保留现有结果并重试。",
      );
    }
  }
  private remaining(s: Session, r: SearchRequest): Toilet[] {
    const rows = [...s.found.values()]
      .map((t) => this.catalog.get(t.id))
      .filter((t): t is Toilet => !!t)
      .map(deriveToilet)
      .filter(
        (t) =>
          t.position &&
          !s.used.has(t.id) &&
          !(t.poiId && s.usedPois.has(t.poiId)) &&
          eligible(t, r, this.now()) &&
          distanceMeters(r.origin, t.position) <= this.radius(r),
      );
    const byDistance = (a: Toilet, b: Toilet) =>
      distanceMeters(r.origin, a.position!) -
        distanceMeters(r.origin, b.position!) || a.id.localeCompare(b.id);
    rows.sort(byDistance);
    if (r.preference === "any") return rows;
    const seated = rows.filter((t) =>
      ["documented", "inferred"].includes(t.seatStatus),
    );
    const ordinary = rows.filter(
      (t) =>
        !["documented", "inferred"].includes(t.seatStatus) &&
        distanceMeters(r.origin, t.position!) <=
          limits.ordinaryRadiusMeters[r.walkLimitMinutes],
    );
    const combined: Toilet[] = [];
    for (let i = 0; i < Math.max(seated.length, ordinary.length); i++) {
      if (seated[i]) combined.push(seated[i]);
      if (ordinary[i]) combined.push(ordinary[i]);
    }
    return combined;
  }
  private createSession(r: SearchRequest, key: string): Session {
    const ordinary = limits.ordinaryRadiusMeters[r.walkLimitMinutes];
    const s: Session = {
      id: randomUUID(),
      key,
      created: Date.now(),
      found: new Map(
        this.catalog.nearby(r.origin, this.radius(r)).map((t) => [t.id, t]),
      ),
      used: new Set(),
      usedPois: new Set(),
      assistedPois: new Set(),
      streams: (r.preference === "seated_required"
        ? [ordinary, this.radius(r)]
        : [ordinary]
      ).map((radius) => ({
        radius,
        page: 1,
        more: true,
        failed: false,
        fingerprints: new Set(),
      })),
      batches: [],
      warnings: new Set(),
      bootstrap: Promise.resolve(),
      discovery: Promise.resolve(),
      upstreamSuccess: false,
      upstreamFailure: false,
    };
    this.sessions.set(s.id, s);
    this.keys.set(key, s.id);
    s.bootstrap = (async () => {
      for (const stream of s.streams) await this.fetchStream(s, stream, r);
      const unresolved = this.catalog
        .unresolvedNearby(r.origin, this.radius(r))
        .filter(
          (t) =>
            r.preference === "any" ||
            ["documented", "inferred"].includes(deriveToilet(t).seatStatus),
        )
        .slice(0, 4);
      await Promise.all(
        unresolved.map(async (local) => {
          try {
            const results = await this.provider.searchPlaces(
              `${local.nameZh} ${local.district}`,
              { toiletsOnly: true, limit: 5 },
            );
            s.upstreamSuccess = true;
            await this.add(s, results.pois, r);
          } catch {
            s.upstreamFailure = true;
            s.warnings.add(
              r.language === "en"
                ? "Some local records could not be matched."
                : "部分本地资料暂未匹配到位置。",
            );
          }
        }),
      );
      void this.catalog.persist();
    })().catch(() => {
      s.upstreamFailure = true;
    });
    s.discovery = s.bootstrap;
    return s;
  }
  private candidate(t: Toilet, r: SearchRequest): Candidate {
    const c: Candidate = {
      toiletId: t.id,
      nameZh: t.nameZh,
      nameEn: t.nameEn,
      addressZh: t.addressZh,
      district: t.district,
      position: t.position,
      seatStatus: t.seatStatus,
      seatBasis: t.seatBasis,
      seatConflict: t.seatConflict,
      facilities: t.facilities,
      openingStatus: openingStatus(t.openingHoursRaw, this.now()),
      openingHoursRaw: t.openingHoursRaw,
      accessCondition: t.accessCondition,
      accessNote: t.accessNote,
      routeStatus: "pending",
      walkSeconds: null,
      walkMeters: null,
      straightLineMeters: t.position
        ? distanceMeters(r.origin, t.position)
        : null,
      reason: "",
      sources: t.sources,
    };
    c.reason = ruleReason(c, r.language);
    return c;
  }
  private group(c: Candidate, r: SearchRequest): GroupName | null {
    if (c.routeStatus === "unreachable") return null;
    const seated = ["documented", "inferred"].includes(c.seatStatus);
    const ordinary = r.preference === "seated_required" && !seated;
    if (
      ordinary &&
      (c.straightLineMeters ?? Infinity) >
        limits.ordinaryRadiusMeters[r.walkLimitMinutes]
    )
      return null;
    let group: Exclude<GroupName, "conditionalAccess">;
    if (c.routeStatus !== "success") group = "routeUnknown";
    else if (c.walkSeconds! > r.walkLimitMinutes * 60) {
      if (r.preference === "seated_required" && seated) group = "farther";
      else return null;
    } else group = ordinary ? "otherNearby" : "matched";
    c.ordinaryAlternative = ordinary;
    if (
      (c.accessCondition === "ticket_required" ||
        c.accessCondition === "purchase_required") &&
      !r.includeConditionalAccess
    ) {
      c.baseGroup = group;
      return "conditionalAccess";
    }
    delete c.baseGroup;
    return group;
  }
  private batch(
    s: Session,
    index: number,
    r: SearchRequest,
    cursor?: string,
  ): Batch {
    const b: Batch = {
      cursor: cursor ?? randomUUID(),
      nextCursor: null,
      candidates: [],
      done: false,
      preparing: true,
      generation: 0,
      analysisStatus: "fallback",
      ready: Promise.resolve(),
    };
    s.batches[index] = b;
    this.cursors.set(b.cursor, { sessionId: s.id, index });
    this.startBatch(s, b, r, false);
    return b;
  }
  private startBatch(s: Session, b: Batch, r: SearchRequest, retry: boolean) {
    b.done = false;
    b.preparing = true;
    b.analysisStatus = this.analyzer ? "pending" : "fallback";
    const generation = ++b.generation;
    let timer: ReturnType<typeof setTimeout>;
    const active = () => b.generation === generation && !b.done;
    const routeJobs: Promise<void>[] = [];
    const routeCandidate = (c: Candidate) => {
      if (c.routeStatus === "success" && !retry) return;
      if (!c.position) return;
      c.routeStatus = "pending";
      c.walkSeconds = null;
      c.walkMeters = null;
      routeJobs.push(
        this.route(r.origin, c.position!, retry).then((route) => {
          if (!active()) return;
          c.routeStatus = route.status;
          c.walkSeconds = route.walkSeconds;
          c.walkMeters = route.walkMeters;
          c.reason = ruleReason(c, r.language);
        }),
      );
    };
    const fill = () => {
      for (const t of this.remaining(s, r).slice(
        0,
        limits.routeBatchSize - b.candidates.length,
      )) {
        if (!active()) return;
        s.used.add(t.id);
        if (t.poiId) s.usedPois.add(t.poiId);
        const c = this.candidate(t, r);
        b.candidates.push(c);
        routeCandidate(c);
      }
    };
    const work = (async () => {
      if (retry) {
        for (const c of b.candidates)
          if (c.routeStatus !== "success") routeCandidate(c);
      } else {
        fill();
        await s.bootstrap;
        if (!active()) return;
        fill();
        for (
          let page = 0;
          b.candidates.length < limits.routeBatchSize && page < 2;
          page++
        ) {
          const stream = s.streams.find((t) => t.more);
          if (!stream) break;
          const task = s.discovery.then(() => this.fetchStream(s, stream, r));
          s.discovery = task;
          await task;
          if (!active()) return;
          fill();
        }
      }
      b.preparing = false;
      await Promise.all(routeJobs);
      if (!active()) return;
      if (this.analyzer && b.candidates.length) {
        try {
          const originals = new Map(b.candidates.map((c) => [c.toiletId, c]));
          const result = await this.analyzer(
            b.candidates.map((c) => structuredClone(c)),
            r,
          );
          if (!active()) return;
          const seen = new Set<string>();
          b.candidates = result.candidates.flatMap((update) => {
            const original = originals.get(update.toiletId);
            if (!original || seen.has(update.toiletId)) return [];
            seen.add(update.toiletId);
            const protectedSeat =
              original.seatStatus === "documented" ||
              original.seatStatus === "unavailable" ||
              original.seatConflict === true ||
              !["inferred", "unknown"].includes(update.seatStatus);
            return [
              {
                ...original,
                nameEn: update.nameEn,
                reason: update.reason,
                seatStatus: protectedSeat
                  ? original.seatStatus
                  : update.seatStatus,
                seatBasis: protectedSeat
                  ? original.seatBasis
                  : update.seatBasis,
              },
            ];
          });
          for (const [id, c] of originals)
            if (!b.candidates.some((x) => x.toiletId === id))
              b.candidates.push(c);
          b.analysisStatus = result.analysisStatus;
        } catch {
          b.analysisStatus = "fallback";
        }
      }
    })().catch(() => {
      s.upstreamFailure = true;
    });
    b.ready = new Promise<void>((resolve) => {
      const finish = (timedOut = false) => {
        if (!active()) {
          resolve();
          return;
        }
        clearTimeout(timer);
        if (timedOut) {
          for (const c of b.candidates)
            if (c.routeStatus === "pending") {
              c.routeStatus = "provider_error";
              c.walkSeconds = null;
              c.walkMeters = null;
            }
          s.upstreamFailure = true;
          b.analysisStatus = "fallback";
        }
        b.preparing = false;
        b.done = true;
        resolve();
      };
      timer = setTimeout(
        () => finish(true),
        this.options.batchTimeoutMs ?? limits.batchTimeoutMs,
      );
      void work.then(() => finish());
    });
  }
  async search(
    r: SearchRequest,
  ): Promise<{ data: SearchResult; warnings: string[] }> {
    const key = this.key(r);
    for (const [id, s] of this.sessions)
      if (Date.now() - s.created > limits.queryCacheMs) {
        this.sessions.delete(id);
        if (this.keys.get(s.key) === id) this.keys.delete(s.key);
        for (const [token, c] of this.cursors)
          if (c.sessionId === id) this.cursors.delete(token);
      }
    let s: Session | undefined;
    let b: Batch | undefined;
    let index = 0;
    if (r.cursor) {
      const cursor = this.cursors.get(r.cursor);
      s = cursor ? this.sessions.get(cursor.sessionId) : undefined;
      if (!cursor || !s || s.key !== key)
        throw new AppError(
          "INVALID_CURSOR",
          "Search settings changed or this page expired. Start a new search.",
          400,
        );
      index = cursor.index;
      b = s.batches[index];
      if (!b) b = this.batch(s, index, r, r.cursor);
      else if (r.retry && b.done) this.startBatch(s, b, r, true);
    } else {
      const current = this.keys.get(key);
      if (current) s = this.sessions.get(current);
      if (!s || (r.retry && s.batches[0]?.done)) s = this.createSession(r, key);
      b = s.batches[0] ?? this.batch(s, 0, r);
    }
    await Promise.race([
      b.ready,
      new Promise((resolve) =>
        setTimeout(
          resolve,
          this.options.firstResponseWaitMs ?? limits.firstResponseWaitMs,
        ),
      ),
    ]);
    if (
      b.done &&
      !b.candidates.length &&
      !s.upstreamSuccess &&
      s.upstreamFailure
    )
      throw new AppError(
        "MAP_UNAVAILABLE",
        "The search service is temporarily unavailable. Please retry.",
        503,
        true,
      );
    const groups = emptyGroups();
    for (const original of b.candidates) {
      const c = { ...original };
      const group = this.group(c, r);
      if (group) groups[group].push(c);
    }
    for (const [group, list] of Object.entries(groups))
      list.sort((a, b) =>
        group === "routeUnknown" ||
        (a.routeStatus !== "success" && b.routeStatus !== "success")
          ? (a.straightLineMeters ?? Infinity) -
              (b.straightLineMeters ?? Infinity) ||
            a.toiletId.localeCompare(b.toiletId)
          : (a.walkSeconds ?? Infinity) - (b.walkSeconds ?? Infinity) ||
            (a.walkMeters ?? Infinity) - (b.walkMeters ?? Infinity) ||
            a.toiletId.localeCompare(b.toiletId),
      );
    const hasMore =
      !!s.batches[index + 1] ||
      this.remaining(s, r).length > 0 ||
      s.streams.some((t) => t.more);
    if (hasMore && !b.nextCursor) {
      b.nextCursor = randomUUID();
      this.cursors.set(b.nextCursor, { sessionId: s.id, index: index + 1 });
    }
    const partial =
      !b.done ||
      s.upstreamFailure ||
      b.candidates.some((c) => c.routeStatus === "provider_error");
    const count = Object.values(groups).reduce((n, g) => n + g.length, 0);
    const summary = !b.done
      ? r.language === "en"
        ? "Checking remaining routes and information."
        : "正在补充路线与信息。"
      : count === 0
        ? r.language === "en"
          ? "No suitable candidates in this batch. Try more results, a wider range or another starting point."
          : "本批暂无合适候选，请加载更多、扩大范围或更换起点。"
        : groups.matched.length === 0
          ? r.language === "en"
            ? "No candidates meet the selected preference and walking time. Other options are shown separately."
            : "没有同时满足需求和步行时限的候选，可查看其他分组。"
          : partial
            ? r.language === "en"
              ? "Available results are shown. Some information is unavailable; you can retry."
              : "已显示可用结果，部分信息暂不可用，可重试。"
            : r.language === "en"
              ? "Compare nearby toilet options."
              : "比较附近厕所候选。";
    return {
      data: {
        status: partial
          ? "partial"
          : b.candidates.length
            ? "complete"
            : "empty",
        queryVersion: r.queryVersion,
        origin: r.origin,
        groups,
        analysisStatus: b.analysisStatus,
        summary,
        pendingWork: !b.done,
        hasMore,
        nextCursor: hasMore ? b.nextCursor : null,
        batchCursor: b.cursor,
      },
      warnings: [...s.warnings],
    };
  }
}
