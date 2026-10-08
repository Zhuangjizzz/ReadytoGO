import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../src/server/app.js";
import type { Toilet } from "../src/shared/contracts.js";

async function withNavigation(
  action: (base: string, requests: URL[]) => Promise<void>,
) {
  const requests: URL[] = [];
  const upstream = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    requests.push(url);
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/v5/direction/walking") {
      const from = url.searchParams.get("origin");
      const route =
        from === "116.410000,39.910000"
          ? { paths: [] }
          : from === "116.420000,39.920000"
            ? { paths: [{ distance: "999", cost: {} }] }
            : {
                paths: [
                  {
                    distance: from === "116.400000,39.900000" ? "240" : "500",
                    cost: {
                      duration: from === "116.400000,39.900000" ? "120" : "350",
                    },
                  },
                ],
              };
      res.end(JSON.stringify({ status: "1", route }));
    } else if (url.pathname === "/v3/geocode/regeo") {
      const location = url.searchParams.get("location");
      res.end(
        JSON.stringify({
          status: "1",
          regeocode: {
            formatted_address: "北京市东城区园路",
            addressComponent: {
              adcode: location?.startsWith("116.900000")
                ? "131028"
                : location?.startsWith("116.800000")
                  ? ""
                  : "110101",
              city: [],
              province: "北京市",
              district: "东城区",
            },
          },
        }),
      );
    } else if (url.pathname === "/v3/assistant/coordinate/convert") {
      res.end(JSON.stringify({ status: "1", locations: "116.4062,39.9014" }));
    } else if (url.pathname === "/v3/staticmap") {
      if (url.searchParams.get("zoom") === "17")
        res.end(
          JSON.stringify({ status: "0", info: "DAILY_QUERY_OVER_LIMIT" }),
        );
      else {
        res.setHeader("content-type", "image/png");
        res.end(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX+8AAAAASUVORK5CYII=",
            "base64",
          ),
        );
      }
    } else res.end(JSON.stringify({ status: "1", pois: [] }));
  });
  upstream.listen(0, "127.0.0.1");
  await new Promise<void>((r) => upstream.once("listening", r));
  const u = upstream.address();
  assert.ok(u && typeof u !== "string");
  const dir = await mkdtemp(join(tmpdir(), "readytogo-navigation-"));
  const toilet: Toilet = {
    id: "destination",
    nameZh: "公园西侧厕所",
    nameEn: null,
    addressZh: "园路 12 号",
    district: "东城区",
    position: { lng: 116.405, lat: 39.905, crs: "GCJ02" },
    sourcePosition: null,
    positionSource: "amap",
    poiId: "provider-id",
    matchMethod: null,
    facilities: {
      maleStalls: 0,
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
    availability: "unknown",
    sources: [],
  };
  const catalogPath = join(dir, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({
      schemaVersion: 1,
      report: {},
      toilets: [toilet, { ...toilet, id: "no-position", position: null }],
    }),
  );
  const { app } = await createApplication({
    catalogPath,
    matchCachePath: null,
    amapKey: "boundary-secret-never-return",
    amapBaseUrl: `http://127.0.0.1:${u.port}`,
    logger: () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  try {
    await action(`http://127.0.0.1:${a.port}/api/v1`, requests);
  } finally {
    server.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
}
const origin = {
  lng: 116.4,
  lat: 39.9,
  crs: "GCJ02",
  label: "地铁出入口",
  source: "place",
};
const post = async (base: string, path: string, body: unknown) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test("navigation recomputes walking values for the chosen origin and keeps handoff usable on route failure", () =>
  withNavigation(async (base) => {
    const first = await post(base, "/navigation/link", {
      toiletId: "destination",
      origin,
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.walkSeconds, 120);
    assert.equal(first.body.data.walkMeters, 240);
    const changed = await post(base, "/navigation/link", {
      toiletId: "destination",
      origin: { ...origin, lng: 116.43, lat: 39.93 },
    });
    assert.equal(changed.body.data.walkSeconds, 350);
    assert.equal(changed.body.data.walkMeters, 500);
    assert.equal(
      new URL(changed.body.data.webUrl).searchParams.get("from"),
      "116.430000,39.930000,地铁出入口",
    );
    for (const [lng, lat, status] of [
      [116.41, 39.91, "unreachable"],
      [116.42, 39.92, "provider_error"],
    ] as const) {
      const failed = await post(base, "/navigation/link", {
        toiletId: "destination",
        origin: { ...origin, lng, lat },
      });
      assert.equal(failed.body.data.routeStatus, status);
      assert.equal(failed.body.data.walkSeconds, null);
      assert.equal(failed.body.data.walkMeters, null);
      assert.equal(
        new URL(failed.body.data.webUrl).searchParams.get("mode"),
        "walk",
      );
      assert.equal(
        new URL(failed.body.data.appUrl).searchParams.get("callnative"),
        "1",
      );
    }
    const noPosition = await post(base, "/navigation/link", {
      toiletId: "no-position",
      origin,
    });
    assert.equal(noPosition.body.data.webUrl, null);
    assert.equal(noPosition.body.data.appUrl, null);
    assert.match(
      noPosition.body.data.searchUrl,
      /^https:\/\/uri.amap.com\/search\?/,
    );
    assert.equal(noPosition.body.data.copyText, "公园西侧厕所\n园路 12 号");
  }));

test("GPS coordinates are converted to a Beijing origin once; an already converted or out-of-city position is rejected", () =>
  withNavigation(async (base, requests) => {
    const converted = await post(base, "/location/convert", {
      lng: 116.4,
      lat: 39.9,
      crs: "WGS84",
      accuracyMeters: 350,
      language: "en",
    });
    assert.equal(converted.status, 200);
    assert.equal(converted.body.data.lng, 116.4062);
    assert.equal(converted.body.data.lat, 39.9014);
    assert.equal(converted.body.data.crs, "GCJ02");
    assert.equal(converted.body.data.accuracyMeters, 350);
    assert.equal(converted.body.data.label, "Approximate current location");
    const convert = requests.find((r) =>
      r.pathname.endsWith("/coordinate/convert"),
    );
    assert.equal(convert?.searchParams.get("coordsys"), "gps");
    const second = await post(base, "/location/convert", converted.body.data);
    assert.equal(second.status, 400);
    const outside = await post(base, "/location/convert", {
      lng: 121.5,
      lat: 31.2,
      crs: "WGS84",
    });
    assert.equal(outside.status, 422);
  }));

test("static maps use a fixed upstream with validated image data and never expose the provider key", () =>
  withNavigation(async (base, requests) => {
    const response = await fetch(
      `${base}/maps/static?lng=116.397&lat=39.909&zoom=14&width=640&height=480`,
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^image\/png/);
    assert.equal((await response.arrayBuffer()).byteLength, 68);
    const upstream = requests.find((r) => r.pathname === "/v3/staticmap");
    assert.equal(upstream?.searchParams.get("size"), "640*480");
    assert.equal(upstream?.searchParams.get("scale"), "1");
    assert.equal(
      upstream?.searchParams.get("location"),
      "116.397000,39.909000",
    );
    assert.equal(response.headers.get("location"), null);
    const invalid = await fetch(
      `${base}/maps/static?lng=116.397&lat=39.909&zoom=18&url=https://example.org`,
    );
    assert.equal(invalid.status, 400);
    const failed = await fetch(
      `${base}/maps/static?lng=116.397&lat=39.909&zoom=17`,
    );
    assert.equal(failed.status, 503);
    const body = await failed.text();
    assert.doesNotMatch(
      body,
      /boundary-secret-never-return|DAILY_QUERY_OVER_LIMIT/,
    );
    assert.match(body, /MAP_UNAVAILABLE/);
  }));

test("map-selected points are checked by administrative region, not only a Beijing bounding box", () =>
  withNavigation(async (base) => {
    const inside = await post(base, "/location/resolve", {
      lng: 116.4,
      lat: 39.9,
      crs: "GCJ02",
      language: "en",
    });
    assert.equal(inside.status, 200);
    assert.equal(inside.body.data.city, "北京市");
    assert.equal(inside.body.data.originType, "map");
    assert.equal(inside.body.data.addressZh, "北京市东城区园路");
    const neighbor = await post(base, "/location/resolve", {
      lng: 116.9,
      lat: 39.7,
      crs: "GCJ02",
    });
    assert.equal(neighbor.status, 422);
    assert.equal(neighbor.body.error.code, "OUTSIDE_BEIJING");
    const uncertain = await post(base, "/location/resolve", {
      lng: 116.8,
      lat: 39.7,
      crs: "GCJ02",
    });
    assert.equal(uncertain.status, 503);
    assert.equal(uncertain.body.error.code, "MAP_UNAVAILABLE");
  }));

test("a temporary origin-validation failure keeps coordinate-based navigation available", () =>
  withNavigation(async (base) => {
    const result = await post(base, "/navigation/link", {
      toiletId: "destination",
      origin: { ...origin, lng: 116.8, lat: 39.7, source: "map" },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.routeStatus, "provider_error");
    assert.equal(result.body.data.walkSeconds, null);
    assert.equal(result.body.data.walkMeters, null);
    assert.ok(result.body.data.appUrl);
    assert.ok(result.body.data.webUrl);
  }));

test("nearby search does not accept a map-origin outside Beijing merely because it falls inside the bounding box", () =>
  withNavigation(async (base) => {
    const result = await post(base, "/toilets/search", {
      origin: { ...origin, lng: 116.9, lat: 39.7, source: "map" },
      context: "nearby",
      preference: "any",
      walkLimitMinutes: 10,
      includeConditionalAccess: false,
      extendedRadiusKm: 5,
      language: "en",
      queryVersion: 1,
    });
    assert.equal(result.status, 422);
    assert.equal(result.body.error.code, "OUTSIDE_BEIJING");
  }));
