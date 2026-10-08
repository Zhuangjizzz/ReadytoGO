import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../src/server/app.js";
import type { AmapProvider } from "../src/server/providers/amap.js";
import type {
  ApiSuccess,
  SearchRequest,
  SearchResult,
  Toilet,
} from "../src/shared/contracts.js";
export function fixture(id: string, patch: Partial<Toilet> = {}): Toilet {
  return {
    id,
    nameZh: `测试厕所${id}`,
    nameEn: null,
    addressZh: `测试街${id}号`,
    district: "东城区",
    position: {
      lng: 116.4 + Number(id.replace(/\D/g, "")) * 0.00005,
      lat: 39.9,
      crs: "GCJ02",
    },
    sourcePosition: null,
    positionSource: "amap",
    poiId: `poi-${id}`,
    matchMethod: null,
    facilities: {
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
    },
    seatStatus: "unknown",
    seatBasis: [],
    openingHoursRaw: null,
    accessCondition: "unknown",
    accessNote: null,
    availability: "active",
    sources: [],
    ...patch,
  };
}
const base: SearchRequest = {
  origin: {
    lng: 116.4,
    lat: 39.9,
    crs: "GCJ02",
    label: "起点",
    source: "place",
  },
  context: "nearby",
  preference: "seated_required",
  walkLimitMinutes: 10,
  includeConditionalAccess: false,
  extendedRadiusKm: 5,
  language: "en",
  queryVersion: 1,
};
async function withApp(
  rows: Toilet[],
  seconds: Record<string, number | "error" | "unreachable">,
  run: (url: string) => Promise<void>,
  now = () => new Date("2026-10-08T17:00:00Z"),
) {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-rules-"));
  const catalogPath = join(dir, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({ schemaVersion: 1, report: {}, toilets: rows }),
  );
  const provider: AmapProvider = {
    searchPlaces: async () => ({ pois: [], hasMore: false }),
    nearbyToilets: async () => ({ pois: [], hasMore: false }),
    convertGps: async (p) => ({ ...p, crs: "GCJ02" }),
    walking: async (origin, destination) => {
      const row = rows.find((t) => t.position?.lng === destination.lng)!;
      const value = seconds[row.id] ?? 300;
      return {
        origin,
        destination,
        status:
          value === "error"
            ? "provider_error"
            : value === "unreachable"
              ? "unreachable"
              : "success",
        walkSeconds: typeof value === "number" ? value : null,
        walkMeters: typeof value === "number" ? 500 : null,
      };
    },
  };
  const { app } = await createApplication({
    catalogPath,
    matchCachePath: null,
    provider,
    now,
    logger: () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  try {
    await run(`http://127.0.0.1:${a.port}`);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
}
async function query(url: string, change: Partial<SearchRequest> = {}) {
  const res = await fetch(`${url}/api/v1/toilets/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...base, ...change }),
  });
  assert.equal(res.status, 200);
  return ((await res.json()) as ApiSuccess<SearchResult>).data;
}
const ids = (rows: { toiletId: string }[]) => rows.map((r) => r.toiletId);

test("seated grouping is exclusive at raw second limits, including restricted alternatives and route failure", async () => {
  const rows = [
    fixture("1", { seatStatus: "documented" }),
    fixture("2", { seatStatus: "inferred" }),
    fixture("3", { seatStatus: "unknown" }),
    fixture("4", { seatStatus: "unavailable" }),
    fixture("5", {
      seatStatus: "inferred",
      accessCondition: "ticket_required",
    }),
    fixture("6", { seatStatus: "inferred" }),
    fixture("7"),
    fixture("8", { seatStatus: "inferred" }),
  ];
  await withApp(
    rows,
    {
      "1": 600,
      "2": 601,
      "3": 599,
      "4": 599,
      "5": 500,
      "6": "error",
      "7": "error",
      "8": "unreachable",
    },
    async (url) => {
      const r = await query(url);
      assert.deepEqual(ids(r.groups.matched), ["1"]);
      assert.deepEqual(ids(r.groups.farther), ["2"]);
      assert.deepEqual(ids(r.groups.otherNearby), ["3", "4"]);
      assert.deepEqual(ids(r.groups.conditionalAccess), ["5"]);
      assert.equal(r.groups.conditionalAccess[0].baseGroup, "matched");
      assert.deepEqual(ids(r.groups.routeUnknown), ["6", "7"]);
      assert.equal(r.groups.routeUnknown[1].ordinaryAlternative, true);
      assert.equal(r.pendingWork, false);
      assert.equal(r.status, "partial");
      const included = await query(url, { includeConditionalAccess: true });
      assert.deepEqual(ids(included.groups.matched), ["5", "1"]);
      assert.equal(included.groups.conditionalAccess.length, 0);
    },
  );
});
test("route ties use stable IDs, and 1200/1201 seconds are separated at the 20-minute limit", async () => {
  const rows = [
    fixture("20", { seatStatus: "inferred" }),
    fixture("10", { seatStatus: "inferred" }),
    fixture("30", { seatStatus: "inferred" }),
  ];
  await withApp(rows, { "10": 1200, "20": 1200, "30": 1201 }, async (url) => {
    const r = await query(url, { walkLimitMinutes: 20 });
    assert.deepEqual(ids(r.groups.matched), ["10", "20"]);
    assert.deepEqual(ids(r.groups.farther), ["30"]);
  });
});
test("Shanghai cross-midnight opening excludes currently closed nearby candidates but retains plan candidates", async () => {
  const rows = [
    fixture("1", { openingHoursRaw: "22:00-06:00" }),
    fixture("2", { openingHoursRaw: "08:00-18:00" }),
    fixture("3", { openingHoursRaw: "节假日另行通知" }),
    fixture("4", { availability: "permanently_closed" }),
    fixture("5", { accessCondition: "restricted" }),
  ];
  await withApp(rows, {}, async (url) => {
    const nearby = await query(url, { preference: "any" });
    assert.deepEqual(ids(nearby.groups.matched), ["1", "3"]);
    assert.equal(nearby.groups.matched[0].openingStatus, "expected_open");
    const plan = await query(url, { preference: "any", context: "plan_stop" });
    assert.deepEqual(ids(plan.groups.matched), ["1", "2", "3"]);
    assert.equal(plan.groups.matched[1].openingStatus, "expected_closed");
  });
});
test("facility notes preserve explicit negative, children-only and contradictory evidence", async () => {
  const notes = [
    "有成人坐便器",
    "无成人坐便器",
    "仅有儿童坐便器",
    "有成人坐便器；无成人坐便器",
    "未提供坐便信息",
  ];
  const rows = notes.map((notes, i) => {
    const t = fixture(String(i + 1));
    t.facilities = { ...t.facilities, thirdRestroom: 1, notes };
    return t;
  });
  await withApp(rows, {}, async (url) => {
    const r = await query(url, { preference: "any" });
    const byId = new Map(
      Object.values(r.groups)
        .flat()
        .map((c) => [c.toiletId, c]),
    );
    assert.equal(byId.get("1")?.seatStatus, "documented");
    assert.equal(byId.get("2")?.seatStatus, "unavailable");
    assert.equal(byId.get("3")?.seatStatus, "unavailable");
    assert.equal(byId.get("4")?.seatStatus, "unknown");
    assert.equal(byId.get("4")?.seatConflict, true);
    assert.equal(byId.get("5")?.seatStatus, "inferred");
  });
});

test("child equipment or missing seating information cannot become documented adult seating", async () => {
  const notes = ["儿童坐便器1个", "无坐便信息", "坐便器数量：0个"];
  const rows = notes.map((notes, i) => {
    const t = fixture(String(i + 1));
    t.facilities.notes = notes;
    return t;
  });
  await withApp(rows, {}, async (url) => {
    const r = await query(url, { preference: "any" });
    const byId = new Map(
      Object.values(r.groups)
        .flat()
        .map((c) => [c.toiletId, c]),
    );
    assert.equal(byId.get("1")?.seatStatus, "unknown");
    assert.equal(byId.get("2")?.seatStatus, "unknown");
    assert.equal(byId.get("3")?.seatStatus, "unavailable");
  });
});
test("the extended seated radius does not pull ordinary unknown facilities into distant recommendations", async () => {
  const rows = [
    fixture("1", {
      seatStatus: "inferred",
      position: { lng: 116.47, lat: 39.9, crs: "GCJ02" },
    }),
    fixture("2", { position: { lng: 116.435, lat: 39.9, crs: "GCJ02" } }),
  ];
  await withApp(rows, { "1": 3000, "2": "error" }, async (url) => {
    const short = await query(url);
    assert.equal(Object.values(short.groups).flat().length, 0);
    const extended = await query(url, { extendedRadiusKm: 10 });
    assert.deepEqual(ids(extended.groups.farther), ["1"]);
    assert.equal(extended.groups.routeUnknown.length, 0);
  });
});

test("entry requirement polarity is evaluated per clause without negating parallel affirmative conditions", async () => {
  const notes = [
    "无需门票，游客可用",
    "不需要消费",
    "无须购买门票及消费",
    "需要消费后使用",
    "需购买门票",
    "无需门票但需要消费",
    "需门票，不必消费",
    "需要门票和消费",
    "No ticket or purchase required",
    "No ticket required but purchase required",
  ];
  const rows = notes.map((notes, i) => {
    const t = fixture(String(i + 1));
    t.facilities.notes = notes;
    return t;
  });
  await withApp(rows, {}, async (url) => {
    const r = await query(url, { preference: "any" });
    assert.deepEqual(ids(r.groups.matched), ["1", "2", "3", "9"]);
    const byId = new Map(
      r.groups.conditionalAccess.map((c) => [c.toiletId, c.accessCondition]),
    );
    assert.equal(byId.get("4"), "purchase_required");
    assert.equal(byId.get("5"), "ticket_required");
    assert.equal(byId.get("6"), "purchase_required");
    assert.equal(byId.get("7"), "ticket_required");
    assert.equal(byId.get("8"), "ticket_required");
    assert.equal(byId.get("10"), "purchase_required");
  });
});
test("explicit out-of-service status is excluded in both contexts, with reopening and negative statements preserved", async () => {
  const notes = [
    "已停用",
    "临时停用",
    "未停用",
    "已恢复开放",
    "此前停用，现已恢复开放",
    "暂停开放",
    "没有停用，仍正常使用",
    "此前停用，目前未恢复开放",
  ];
  const rows = notes.map((notes, i) => {
    const t = fixture(String(i + 1));
    t.facilities.notes = notes;
    return t;
  });
  const sourceOnly = fixture("9");
  sourceOnly.sources = [
    { provider: "beijing_csv", name: "台账", rawFields: { 指标状况: "停用" } },
  ];
  rows.push(sourceOnly);
  await withApp(rows, {}, async (url) => {
    for (const context of ["nearby", "plan_stop"] as const) {
      const r = await query(url, { preference: "any", context });
      assert.deepEqual(ids(r.groups.matched), ["3", "4", "5", "7"]);
    }
    const response = await fetch(url + "/api/v1/toilets/2");
    const { data } = (await response.json()) as ApiSuccess<Toilet>;
    assert.equal(data.availability, "out_of_service");
  });
});
