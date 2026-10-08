import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApplication } from "../src/server/app.js";
import type { ApiSuccess, SearchResult } from "../src/shared/contracts.js";

test("HTTP search reads nested route cost and distinguishes malformed routes from explicit empty paths", async () => {
  const upstream = createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    res.setHeader("content-type", "application/json");
    if (url.pathname === "/v5/place/around") {
      assert.equal(url.searchParams.get("sortrule"), "distance");
      res.end(
        JSON.stringify({
          status: "1",
          pois: [1, 2, 3, 4, 5].map((n) => ({
            id: `p${n}`,
            name: `测试公厕${n}`,
            address: `测试路${n}号`,
            adname: "东城区",
            cityname: "北京市",
            typecode: n === 5 ? "200304" : "200300",
            type: "公共设施;公共厕所",
            location: `116.40${n},39.9`,
          })),
        }),
      );
    } else if (url.pathname === "/v5/direction/walking") {
      assert.equal(url.searchParams.get("show_fields"), "cost");
      const destination = url.searchParams.get("destination")!;
      const route = destination.startsWith("116.401")
        ? { paths: [{ distance: "299", cost: { duration: "239" } }] }
        : destination.startsWith("116.402")
          ? {}
          : destination.startsWith("116.403")
            ? { paths: [{ distance: "299", cost: {}, duration: "999" }] }
            : { paths: [] };
      res.end(JSON.stringify({ status: "1", route }));
    } else res.end(JSON.stringify({ status: "1", pois: [] }));
  });
  upstream.listen(0, "127.0.0.1");
  await new Promise<void>((r) => upstream.once("listening", r));
  const u = upstream.address();
  assert.ok(u && typeof u !== "string");
  const dir = await mkdtemp(join(tmpdir(), "readytogo-provider-"));
  const catalogPath = join(dir, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({ schemaVersion: 1, report: {}, toilets: [] }),
  );
  const { app } = await createApplication({
    catalogPath,
    matchCachePath: null,
    amapKey: "test-only-boundary-key",
    amapBaseUrl: `http://127.0.0.1:${u.port}`,
    logger: () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  try {
    const request = {
      origin: {
        lng: 116.4,
        lat: 39.9,
        crs: "GCJ02",
        label: "测试起点",
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
    let data: SearchResult | undefined;
    for (let i = 0; i < 20; i++) {
      const res: Response = await fetch(
        `http://127.0.0.1:${a.port}/api/v1/toilets/search`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      assert.equal(res.status, 200);
      data = ((await res.json()) as ApiSuccess<SearchResult>).data;
      if (!data.pendingWork) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(data);
    assert.equal(data.pendingWork, false);
    assert.equal(data.groups.matched[0].walkSeconds, 239);
    assert.equal(data.groups.matched[0].walkMeters, 299);
    assert.equal(data.groups.routeUnknown.length, 2);
    assert.equal(
      Object.values(data.groups)
        .flat()
        .some((c) => c.toiletId === "amap_p5"),
      false,
    );
    for (const candidate of data.groups.routeUnknown) {
      assert.equal(candidate.walkSeconds, null);
      assert.equal(candidate.walkMeters, null);
    }
    assert.equal(
      Object.values(data.groups)
        .flat()
        .some((c) => c.toiletId === "amap_p4"),
      false,
    );
  } finally {
    server.close();
    upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});
