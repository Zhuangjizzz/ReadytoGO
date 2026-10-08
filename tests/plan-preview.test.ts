import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../src/server/app.js";
import type { AmapProvider } from "../src/server/providers/amap.js";
import type { Place } from "../src/shared/contracts.js";

const place: Place = {
  provider: "amap",
  poiId: "attraction",
  nameZh: "游览地点",
  nameEn: null,
  addressZh: "园路",
  district: "东城区",
  city: "北京市",
  position: { lng: 116.4, lat: 39.9, crs: "GCJ02" },
  originType: "poi",
};
const settings = {
  language: "en",
  preference: "any",
  includeConditionalAccess: false,
  walkLimitMinutes: 10,
  extendedRadiusKm: 5,
};
async function withApp(
  run: (base: string, routes: () => number) => Promise<void>,
  options: { gate?: Promise<void>; failedOrigin?: number } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-plan-"));
  const catalogPath = join(dir, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({ schemaVersion: 1, report: {}, toilets: [] }),
  );
  let count = 0;
  const provider: AmapProvider = {
    searchPlaces: async () => ({ pois: [], hasMore: false }),
    nearbyToilets: async (origin) => {
      if (origin.lng === options.failedOrigin)
        throw new Error("provider unavailable");
      return {
        pois: [1, 2, 3, 4].map((n) => ({
          id: `wc-${n}`,
          name: `园路${n}号公厕`,
          address: `园路${n}号`,
          district: "东城区",
          city: "北京市",
          position: {
            lng: 116.4001 + n * 0.0001,
            lat: 39.9,
            crs: "GCJ02" as const,
          },
          typeCode: "200300",
          type: "公共设施;公共厕所",
          openingHours: "08:00-18:00",
        })),
        hasMore: false,
      };
    },
    walking: async (origin, destination) => {
      count++;
      await options.gate;
      return {
        origin,
        destination,
        status: "success",
        walkSeconds: 300,
        walkMeters: 400,
      };
    },
    convertGps: async (p) => ({ ...p, crs: "GCJ02" }),
  };
  const { app } = await createApplication({
    catalogPath,
    matchCachePath: null,
    provider,
    now: () => new Date("2026-10-08T17:00:00Z"),
    logger: () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://127.0.0.1:${address.port}`, () => count);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
}
async function post(base: string, body: unknown) {
  const res = await fetch(`${base}/api/v1/plans/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("plan preview keeps repeated stops distinct, retains periodic opening and reuses routes after reordering", async () =>
  withApp(async (base, routes) => {
    const stops = [
      { stopId: "visit-1", place },
      { stopId: "visit-2", place },
    ];
    const first = await post(base, { ...settings, stops, revision: 1 });
    assert.equal(first.status, 200);
    assert.deepEqual(
      first.body.data.stops.map((s: { stopId: string }) => s.stopId),
      ["visit-1", "visit-2"],
    );
    const stop = first.body.data.stops[0];
    assert.equal(stop.primary.toiletId, "amap_wc-1");
    assert.equal(stop.primary.openingStatus, "expected_closed");
    assert.equal(stop.alternatives.length, 2);
    assert.equal(stop.result.groups.matched.length, 4);
    const second = await post(base, {
      ...settings,
      stops: [...stops].reverse(),
      revision: 2,
    });
    assert.equal(second.body.data.revision, 2);
    assert.deepEqual(
      second.body.data.stops.map((s: { stopId: string }) => s.stopId),
      ["visit-2", "visit-1"],
    );
    assert.equal(routes(), 4);
  }));

test("preview accepts one to ten selected stops and rejects empty, excess, duplicate identities and out-of-Beijing input", async () =>
  withApp(async (base) => {
    for (const count of [0, 11])
      assert.equal(
        (
          await post(base, {
            ...settings,
            revision: 1,
            stops: Array.from({ length: count }, (_, i) => ({
              stopId: `s${i}`,
              place,
            })),
          })
        ).status,
        400,
      );
    assert.equal(
      (
        await post(base, {
          ...settings,
          revision: 1,
          stops: [
            { stopId: "same", place },
            { stopId: "same", place },
          ],
        })
      ).status,
      400,
    );
    const ten = await post(base, {
      ...settings,
      revision: 2,
      stops: Array.from({ length: 10 }, (_, i) => ({ stopId: `s${i}`, place })),
    });
    assert.equal(ten.status, 200);
    assert.equal(ten.body.data.stops.length, 10);
    assert.equal(
      (
        await post(base, {
          ...settings,
          revision: 3,
          stops: [
            {
              stopId: "away",
              place: {
                ...place,
                position: { lng: 121.4, lat: 31.2, crs: "GCJ02" },
              },
            },
          ],
        })
      ).status,
      422,
    );
  }));

test("in-flight stop previews reattach under a new revision without issuing the same routes again", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await withApp(
    async (base, routes) => {
      const stops = [
        { stopId: "a", place },
        { stopId: "b", place },
      ];
      const first = await post(base, { ...settings, revision: 1, stops });
      assert.equal(first.body.data.stops[0].result.pendingWork, true);
      const reordered = await post(base, {
        ...settings,
        revision: 2,
        stops: [...stops].reverse(),
      });
      assert.equal(reordered.body.data.stops[0].stopId, "b");
      assert.equal(routes(), 4);
      release();
      let complete = await post(base, {
        ...settings,
        revision: 2,
        stops: [...stops].reverse(),
      });
      for (
        let i = 0;
        complete.body.data.stops.some(
          (s: { result: { pendingWork: boolean } }) => s.result.pendingWork,
        ) && i < 20;
        i++
      ) {
        await new Promise((r) => setTimeout(r, 10));
        complete = await post(base, {
          ...settings,
          revision: 2,
          stops: [...stops].reverse(),
        });
      }
      assert.equal(complete.body.data.stops[0].result.pendingWork, false);
      assert.equal(complete.body.data.stops[0].result.queryVersion, 2);
      assert.equal(routes(), 4);
    },
    { gate },
  );
});

test("one failed stop is distinguishable from an empty stop and does not erase successful stops", async () =>
  withApp(
    async (base) => {
      const result = await post(base, {
        ...settings,
        revision: 1,
        stops: [
          { stopId: "good", place },
          {
            stopId: "failed",
            place: { ...place, position: { ...place.position, lng: 116.47 } },
          },
        ],
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.data.status, "partial");
      assert.equal(result.body.data.stops[0].primary.toiletId, "amap_wc-1");
      assert.equal(result.body.data.stops[1].result, null);
      assert.equal(result.body.data.stops[1].error.retryable, true);
    },
    { failedOrigin: 116.47 },
  ));
