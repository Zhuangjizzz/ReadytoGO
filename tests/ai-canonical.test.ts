import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../src/server/app.js";
import type {
  SearchRequest,
  SearchResult,
  ApiSuccess,
  Toilet,
} from "../src/shared/contracts.js";
import type {
  AmapProvider,
  ProviderPoi,
} from "../src/server/providers/amap.js";
import type { JsonModel } from "../src/server/providers/qwen.js";

const local: Toilet = {
  id: "courtyard-record",
  nameZh: "庭院东门卫生间",
  nameEn: null,
  addressZh: "院内东部",
  district: "东城区",
  position: null,
  sourcePosition: { lng: 116.4001, lat: 39.9, crs: "unknown" },
  positionSource: null,
  poiId: null,
  matchMethod: null,
  facilities: {
    maleStalls: null,
    femaleStalls: null,
    unisexStalls: null,
    thirdRestroom: null,
    accessibility: null,
    accessibleRoom: 1,
    allAccessible: null,
    accessibleStalls: null,
    managementRoom: null,
    washroom: null,
    adultSeated: null,
    childSeatedOnly: null,
    notes: null,
  },
  seatStatus: "inferred",
  seatBasis: ["资料记载无障碍厕所间"],
  openingHoursRaw: null,
  accessCondition: "public",
  accessNote: null,
  availability: "active",
  sources: [],
};
const poi: ProviderPoi = {
  id: "map-courtyard",
  name: "庭院东入口公厕",
  address: "院内东侧",
  district: "东城区",
  city: "北京市",
  position: { lng: 116.4003, lat: 39.9, crs: "GCJ02" },
  typeCode: "200300",
  type: "公共厕所",
  openingHours: null,
};
const provider: AmapProvider = {
  searchPlaces: async () => ({ pois: [], hasMore: false }),
  nearbyToilets: async () => ({ pois: [poi], hasMore: false }),
  walking: async (origin, destination) => ({
    origin,
    destination,
    status: "success",
    walkSeconds: origin.lng === 116.4 ? 101 : 202,
    walkMeters: origin.lng === 116.4 ? 144 : 288,
  }),
  convertGps: async (p) => ({ ...p, crs: "GCJ02" }),
};
const model: JsonModel = {
  complete: async (input) => {
    const data = input.data as {
      poi?: unknown;
      candidates?: { toiletId: string; seatStatus: string }[];
    };
    if (data.poi) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return JSON.stringify({
        recordId: local.id,
        basisFields: ["nameZh", "addressZh"],
      });
    }
    return JSON.stringify({
      items: data.candidates!.map((c) => ({
        toiletId: c.toiletId,
        seatInference: null,
        basisFields: [],
        reason:
          c.seatStatus === "inferred"
            ? "An accessible room may provide adult seating."
            : "Adult seating is unknown.",
      })),
    });
  },
};
function request(lng: number, queryVersion = 1): SearchRequest {
  return {
    origin: {
      lng,
      lat: 39.9,
      crs: "GCJ02",
      label: "Independent station",
      source: "manual",
    },
    context: "plan_stop",
    preference: "seated_required",
    walkLimitMinutes: 10,
    includeConditionalAccess: false,
    extendedRadiusKm: 5,
    language: "en",
    queryVersion,
  };
}
async function fixture(map = provider, cached = false) {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-canonical-"));
  const catalogPath = join(dir, "catalog.json");
  const matchCachePath = join(dir, "matches.json");
  await writeFile(
    catalogPath,
    JSON.stringify({ schemaVersion: 1, report: {}, toilets: [local] }),
  );
  if (cached)
    await writeFile(
      matchCachePath,
      JSON.stringify([
        {
          matchRuleVersion: 2,
          id: local.id,
          nameZh: local.nameZh,
          addressZh: local.addressZh,
          district: local.district,
          position: poi.position,
          poiId: poi.id,
          matchMethod: "ai_assisted",
          openingHoursRaw: null,
          sources: [
            {
              provider: "amap",
              name: "高德地图",
              poiId: poi.id,
              rawFields: {
                typeCode: "200300",
                name: poi.name,
                address: poi.address,
              },
            },
          ],
        },
      ]),
    );
  const { app } = await createApplication({
    catalogPath,
    matchCachePath: cached ? matchCachePath : null,
    provider: map,
    model,
    queryOptions: { firstResponseWaitMs: 5 },
    logger: () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  return {
    search: async (input: SearchRequest): Promise<SearchResult> => {
      let cursor = input.cursor;
      for (let i = 0; i < 50; i++) {
        const response: Response = await fetch(`${base}/toilets/search`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...input, cursor }),
        });
        assert.equal(response.status, 200);
        const { data } = (await response.json()) as ApiSuccess<SearchResult>;
        if (!data.pendingWork) return data;
        cursor = data.batchCursor;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error("Search did not settle within its bounded test window");
    },
    detail: (id: string) => fetch(`${base}/toilets/${id}`),
    close: async () => {
      server.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("concurrent stations share canonical facilities while retaining their independent walking routes and old detail IDs", async () => {
  const f = await fixture();
  try {
    const results = await Promise.all([
      f.search(request(116.4)),
      f.search(request(116.401)),
    ]);
    for (const [index, result] of results.entries()) {
      assert.equal(result.groups.otherNearby.length, 0);
      assert.equal(result.groups.matched.length, 1);
      const candidate = result.groups.matched[0];
      assert.equal(candidate.toiletId, local.id);
      assert.equal(candidate.facilities.accessibleRoom, 1);
      assert.ok(
        candidate.sources.some(
          (source) => source.provider === "amap" && source.poiId === poi.id,
        ),
      );
      assert.equal(candidate.walkSeconds, index === 0 ? 101 : 202);
      assert.equal(candidate.walkMeters, index === 0 ? 144 : 288);
      const again = await f.search({
        ...request(index === 0 ? 116.4 : 116.401, 7),
        cursor: result.batchCursor,
      });
      assert.equal(again.queryVersion, 7);
      assert.equal(again.groups.matched[0].toiletId, local.id);
    }
    const old = await f.detail(`amap_${poi.id}`);
    assert.equal(old.status, 200);
    assert.equal(((await old.json()) as ApiSuccess<Toilet>).data.id, local.id);
  } finally {
    await f.close();
  }
});

test("a completed station refreshes its canonical identity and facilities after another station associates the POI", async () => {
  const f = await fixture({
    ...provider,
    nearbyToilets: async (origin) => ({
      pois: [
        {
          ...poi,
          name: origin.lng === 116.4 ? "通道北端" : local.nameZh,
          address: origin.lng === 116.4 ? "南面通道" : local.addressZh,
        },
      ],
      hasMore: false,
    }),
  });
  try {
    const first = await f.search(request(116.4));
    assert.equal(first.groups.otherNearby[0].toiletId, `amap_${poi.id}`);
    const next = await f.search(request(116.401));
    assert.equal(next.groups.matched[0].toiletId, local.id);
    const refreshed = await f.search({
      ...request(116.4, 8),
      cursor: first.batchCursor,
    });
    assert.equal(refreshed.groups.otherNearby.length, 0);
    assert.equal(refreshed.groups.matched[0].toiletId, local.id);
    assert.equal(refreshed.groups.matched[0].facilities.accessibleRoom, 1);
    assert.equal(refreshed.groups.matched[0].walkSeconds, 101);
    const old = await f.detail(`amap_${poi.id}`);
    assert.equal(old.status, 200);
  } finally {
    await f.close();
  }
});

test("saved standalone IDs still resolve after persisted associations are loaded", async () => {
  const f = await fixture(provider, true);
  try {
    const response = await f.detail(`amap_${poi.id}`);
    assert.equal(response.status, 200);
    const { data } = (await response.json()) as ApiSuccess<Toilet>;
    assert.equal(data.id, local.id);
    assert.equal(data.facilities.accessibleRoom, 1);
  } finally {
    await f.close();
  }
});
