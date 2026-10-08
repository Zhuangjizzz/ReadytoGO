import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../src/server/app.js";
import type {
  ApiSuccess,
  CatalogFile,
  Position,
  SearchRequest,
  SearchResult,
  Toilet,
} from "../src/shared/contracts.js";
import type {
  AmapProvider,
  ProviderPoi,
} from "../src/server/providers/amap.js";
const origin = {
  lng: 116.4,
  lat: 39.9,
  crs: "GCJ02",
  label: "选择的起点",
  source: "place",
} as const;
const poi: ProviderPoi = {
  id: "provider-a",
  name: "园路公厕",
  address: "园路1号",
  district: "东城区",
  city: "北京市",
  position: { lng: 116.4005, lat: 39.9, crs: "GCJ02" },
  typeCode: "200300",
  type: "公共设施;公共厕所",
  openingHours: null,
};
const catalog: CatalogFile = {
  schemaVersion: 1,
  report: {
    inputFile: "test.csv",
    inputRecords: 1,
    importedCount: 1,
    mergedCount: 0,
    skippedCount: 0,
    parsedPositionCount: 1,
    usablePositionCount: 0,
    anomalies: {},
    sampleToiletIds: ["local-a"],
  },
  toilets: [
    {
      id: "local-a",
      nameZh: "园路公厕",
      nameEn: null,
      addressZh: "园路1号",
      district: "东城区",
      position: null,
      sourcePosition: { lng: 116.4002, lat: 39.9, crs: "unknown" },
      positionSource: null,
      poiId: null,
      matchMethod: null,
      facilities: {
        maleStalls: 0,
        femaleStalls: null,
        unisexStalls: null,
        thirdRestroom: 1,
        accessibility: false,
        accessibleRoom: null,
        allAccessible: null,
        accessibleStalls: null,
        managementRoom: null,
        washroom: null,
        adultSeated: null,
        childSeatedOnly: null,
        notes: null,
      },
      seatStatus: "inferred",
      seatBasis: ["资料记载第三卫生间"],
      openingHoursRaw: null,
      accessCondition: "unknown",
      accessNote: null,
      availability: "active",
      sources: [],
    },
  ],
};
const provider: AmapProvider = {
  searchPlaces: async () => ({ pois: [poi], hasMore: false }),
  nearbyToilets: async () => ({
    pois: [
      poi,
      {
        ...poi,
        id: "provider-b",
        name: "另一处公厕",
        address: "园路8号",
        position: { ...poi.position, lng: 116.401 },
      },
    ],
    hasMore: false,
  }),
  walking: async (from, to) =>
    to.lng === 116.401
      ? {
          origin: from,
          destination: to,
          status: "provider_error",
          walkMeters: null,
          walkSeconds: null,
        }
      : {
          origin: from,
          destination: to,
          status: "success",
          walkSeconds: 480,
          walkMeters: 510,
        },
  convertGps: async (p) => ({ ...p, crs: "GCJ02" }),
};
const request: SearchRequest = {
  origin,
  context: "nearby",
  preference: "any",
  walkLimitMinutes: 10,
  includeConditionalAccess: false,
  extendedRadiusKm: 5,
  language: "en",
  queryVersion: 1,
};
async function withApp(action: (base: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-query-"));
  const path = join(dir, "catalog.json");
  await writeFile(path, JSON.stringify(catalog));
  const { app } = await createApplication({
    catalogPath: path,
    matchCachePath: null,
    provider,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  try {
    await action(`http://127.0.0.1:${a.port}`);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
}
async function query(base: string, body: SearchRequest) {
  const res = await fetch(`${base}/api/v1/toilets/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, body: (await res.json()) as ApiSuccess<SearchResult> };
}

test("a selected real-provider place yields a deduplicated local match, true walking values and explicit route failure", async () =>
  withApp(async (base) => {
    const places = await fetch(
      `${base}/api/v1/places/search?q=园路&city=beijing&language=en`,
    );
    assert.equal(places.status, 200);
    let reply = await query(base, request);
    assert.equal(reply.res.status, 200);
    for (let n = 0; reply.body.data.pendingWork && n < 20; n++) {
      await new Promise((r) => setTimeout(r, 20));
      reply = await query(base, request);
    }
    assert.equal(reply.body.data.status, "partial");
    assert.equal(reply.body.data.pendingWork, false);
    const matches = reply.body.data.groups.matched;
    assert.equal(matches.length, 1);
    assert.equal(matches[0].toiletId, "local-a");
    assert.equal(matches[0].walkSeconds, 480);
    assert.equal(matches[0].walkMeters, 510);
    assert.equal(matches[0].facilities.thirdRestroom, 1);
    const unknown = reply.body.data.groups.routeUnknown;
    assert.equal(unknown.length, 1);
    assert.equal(unknown[0].walkSeconds, null);
    assert.equal(unknown[0].walkMeters, null);
    const detail = (await (
      await fetch(`${base}/api/v1/toilets/local-a`)
    ).json()) as ApiSuccess<Toilet>;
    assert.equal(detail.data.positionSource, "amap");
    assert.equal(
      detail.data.sources.filter((s) => s.provider === "amap").length,
      1,
    );
    const again = await query(base, { ...request, queryVersion: 4 });
    assert.equal(again.body.data.queryVersion, 4);
    assert.deepEqual(again.body.data.groups, reply.body.data.groups);
  }));

test("out-of-Beijing and malformed origins return distinct public errors", async () =>
  withApp(async (base) => {
    assert.equal(
      (
        await query(base, {
          ...request,
          origin: { ...origin, lng: 121.5, lat: 31.2 },
        })
      ).res.status,
      422,
    );
    const response = await fetch(`${base}/api/v1/toilets/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, origin: { ...origin, lng: "wrong" } }),
    });
    assert.equal(response.status, 400);
  }));

test("current imported facilities and closure state survive an older location cache", async () => {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-cache-"));
  const path = join(dir, "catalog.json");
  const cache = join(dir, "matches.json");
  const current = structuredClone(catalog);
  current.toilets[0].facilities.thirdRestroom = 0;
  current.toilets[0].seatStatus = "unknown";
  current.toilets[0].seatBasis = [];
  current.toilets[0].availability = "permanently_closed";
  const old = structuredClone(catalog.toilets[0]);
  old.position = poi.position;
  old.poiId = poi.id;
  old.positionSource = "amap";
  old.matchMethod = "name_address";
  await writeFile(path, JSON.stringify(current));
  await writeFile(cache, JSON.stringify([{ ...old, matchRuleVersion: 2 }]));
  const { app } = await createApplication({
    catalogPath: path,
    matchCachePath: cache,
    provider,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  try {
    const reply = (await (
      await fetch(`http://127.0.0.1:${a.port}/api/v1/toilets/local-a`)
    ).json()) as ApiSuccess<Toilet>;
    assert.equal(reply.data.facilities.thirdRestroom, 0);
    assert.equal(reply.data.seatStatus, "unknown");
    assert.equal(reply.data.availability, "permanently_closed");
    assert.deepEqual(reply.data.position, poi.position);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a public error shares its request ID with a log that omits request contents", async () => {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-log-"));
  const path = join(dir, "catalog.json");
  await writeFile(path, JSON.stringify(catalog));
  const logs: import("../src/server/app.js").RequestLog[] = [];
  const { app } = await createApplication({
    catalogPath: path,
    matchCachePath: null,
    provider,
    logger: (entry) => logs.push(entry),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  try {
    const response = await fetch(
      `http://127.0.0.1:${a.port}/api/v1/toilets/search`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...request,
          origin: {
            ...origin,
            label: "private-trip-text",
            lng: 121.51234,
            lat: 31.27891,
          },
        }),
      },
    );
    const body = (await response.json()) as { requestId: string };
    assert.equal(response.status, 422);
    assert.equal(logs[0].requestId, body.requestId);
    assert.equal(logs[0].errorCode, "OUTSIDE_BEIJING");
    assert.equal(logs[0].route, "/toilets/search");
    assert.equal(
      /private-trip-text|121\.51234|31\.27891/.test(JSON.stringify(logs)),
      false,
    );
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
