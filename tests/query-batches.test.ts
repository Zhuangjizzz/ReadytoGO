import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createApplication,
  type ApplicationOptions,
} from "../src/server/app.js";
import type { AmapProvider } from "../src/server/providers/amap.js";
import type {
  ApiSuccess,
  SearchResult,
  SearchRequest,
  Toilet,
} from "../src/shared/contracts.js";
const request: SearchRequest = {
  origin: {
    lng: 116.4,
    lat: 39.9,
    crs: "GCJ02",
    label: "起点",
    source: "place",
  },
  context: "nearby",
  preference: "any",
  walkLimitMinutes: 10,
  includeConditionalAccess: false,
  extendedRadiusKm: 5,
  language: "en",
  queryVersion: 1,
};
function fixture(n: number): Toilet {
  return {
    id: `t${n}`,
    nameZh: `地点${n}`,
    nameEn: null,
    addressZh: `测试街${n}号`,
    district: "东城区",
    position: { lng: 116.4 + n * 0.00001, lat: 39.9, crs: "GCJ02" },
    sourcePosition: null,
    positionSource: "amap",
    poiId: `poi${n}`,
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
  };
}
const provider: AmapProvider = {
  searchPlaces: async () => ({ pois: [], hasMore: false }),
  nearbyToilets: async () => ({ pois: [], hasMore: false }),
  convertGps: async (p) => ({ ...p, crs: "GCJ02" }),
  walking: async (origin, destination) => ({
    origin,
    destination,
    status: "success",
    walkSeconds: 100,
    walkMeters: 120,
  }),
};
async function withApp(
  rows: Toilet[],
  p: AmapProvider,
  run: (url: string) => Promise<void>,
  options: ApplicationOptions = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-batch-"));
  const catalogPath = join(dir, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({ schemaVersion: 1, report: {}, toilets: rows }),
  );
  const { app } = await createApplication({
    catalogPath,
    matchCachePath: null,
    provider: p,
    logger: () => {},
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
}
async function search(url: string, overrides: Partial<SearchRequest> = {}) {
  const res = await fetch(url + "/api/v1/toilets/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, ...overrides }),
  });
  return { res, body: (await res.json()) as ApiSuccess<SearchResult> };
}

test("manual pages continue past 60 without losing candidates, while a repeated batch does not advance", async () =>
  withApp(
    Array.from({ length: 73 }, (_, n) => fixture(n + 1)),
    provider,
    async (url) => {
      const all = new Set<string>();
      let cursor: string | null = null;
      let first: SearchResult | undefined;
      for (let page = 0; page < 10; page++) {
        const { res, body } = await search(url, { cursor });
        assert.equal(res.status, 200);
        const result = body.data;
        first ??= result;
        assert.ok(result.batchCursor);
        assert.equal(result.pendingWork, false);
        const ids = Object.values(result.groups)
          .flat()
          .map((c) => c.toiletId);
        assert.ok(ids.length <= 10);
        for (const id of ids) {
          assert.equal(all.has(id), false);
          all.add(id);
        }
        const reread = (
          await search(url, { cursor: result.batchCursor, queryVersion: 3 })
        ).body.data;
        assert.deepEqual(reread.groups, result.groups);
        assert.equal(reread.queryVersion, 3);
        if (!result.hasMore) break;
        cursor = result.nextCursor;
      }
      assert.equal(all.size, 73);
      const invalid = await search(url, {
        cursor: first!.batchCursor,
        walkLimitMinutes: 20,
      });
      assert.equal(invalid.res.status, 400);
    },
  ));
test("terminal partial results stay fixed until explicit retry, retaining previously successful routes", async () => {
  let healthy = false;
  const rows = [fixture(1), fixture(2)];
  const p: AmapProvider = {
    ...provider,
    walking: async (origin, destination) =>
      destination.lng === rows[0].position!.lng
        ? {
            origin,
            destination,
            status: "success",
            walkSeconds: healthy ? 200 : 100,
            walkMeters: 120,
          }
        : {
            origin,
            destination,
            status: healthy ? "success" : "provider_error",
            walkSeconds: healthy ? 150 : null,
            walkMeters: healthy ? 180 : null,
          },
  };
  await withApp(rows, p, async (url) => {
    const first = (await search(url)).body.data;
    assert.equal(first.pendingWork, false);
    assert.equal(first.status, "partial");
    healthy = true;
    const stable = (await search(url, { cursor: first.batchCursor })).body.data;
    assert.equal(stable.status, "partial");
    assert.equal(stable.groups.routeUnknown[0].walkSeconds, null);
    const retry = (
      await search(url, {
        cursor: first.batchCursor,
        retry: true,
        queryVersion: 2,
      })
    ).body.data;
    assert.equal(retry.pendingWork, false);
    assert.equal(retry.groups.routeUnknown.length, 0);
    assert.deepEqual(
      retry.groups.matched.map((c) => c.walkSeconds),
      [100, 150],
    );
  });
});
test("a bounded batch stops waiting for an unresolved provider and returns a terminal null route", async () =>
  withApp(
    [fixture(1)],
    { ...provider, walking: async () => new Promise(() => {}) },
    async (url) => {
      const first = (await search(url)).body.data;
      assert.equal(first.pendingWork, true);
      await new Promise((r) => setTimeout(r, 70));
      const done = (await search(url, { cursor: first.batchCursor })).body.data;
      assert.equal(done.pendingWork, false);
      assert.equal(done.status, "partial");
      assert.equal(done.groups.routeUnknown[0].walkSeconds, null);
      const again = (await search(url, { cursor: first.batchCursor })).body
        .data;
      assert.equal(again.pendingWork, false);
    },
    { queryOptions: { batchTimeoutMs: 50, firstResponseWaitMs: 5 } },
  ));
test("empty discovery differs from provider failure", async () => {
  await withApp([], provider, async (url) => {
    const empty = await search(url);
    assert.equal(empty.res.status, 200);
    assert.equal(empty.body.data.status, "empty");
    assert.equal(empty.body.data.pendingWork, false);
  });
  await withApp(
    [],
    {
      ...provider,
      nearbyToilets: async () => {
        throw new Error("provider unavailable");
      },
    },
    async (url) => {
      const failure = await search(url);
      assert.equal(failure.res.status, 503);
    },
  );
});
