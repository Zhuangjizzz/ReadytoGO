import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import iconv from "iconv-lite";
import { createApplication } from "../src/server/app.js";
import type {
  AmapProvider,
  ProviderPoi,
} from "../src/server/providers/amap.js";
import type {
  ApiSuccess,
  ImportReport,
  SearchResult,
} from "../src/shared/contracts.js";
const exec = promisify(execFile);

for (const scenario of [
  {
    name: "different complete house numbers stay separate even nearby",
    local: "和平里北街1号",
    address: "和平里北街10号",
    lng: 116.401,
    matched: false,
  },
  {
    name: "house-number prefixes do not match larger numbers",
    local: "和平里北街12号",
    address: "和平里北街123号",
    lng: 116.401,
    matched: false,
  },
  {
    name: "a matching house number accepts additional entrance wording",
    local: "和平里北街12号",
    address: "和平里北街12号南侧入口",
    lng: 116.401,
    matched: true,
  },
  {
    name: "a conflicting source position prevents the same address from merging",
    local: "和平里北街12号",
    address: "和平里北街12号",
    lng: 116.412,
    matched: false,
  },
  {
    name: "a matching name does not override a different road",
    local: "和平里北街12号",
    address: "青年湖北街12号",
    lng: 116.401,
    matched: false,
  },
  {
    name: "a named road conflict stays separate when one house number is missing",
    local: "和平里北街12号",
    address: "青年湖北街南侧入口",
    lng: 116.401,
    matched: false,
  },
  {
    name: "a road-name suffix is not the same road",
    local: "和平里北街12号",
    address: "新和平里北街12号",
    lng: 116.401,
    matched: false,
  },
  {
    name: "a house-number letter is part of the complete number",
    local: "和平里北街甲12号",
    address: "和平里北街12号",
    lng: 116.401,
    matched: false,
  },
]) {
  test(scenario.name, async () => {
    const dir = await mkdtemp(join(tmpdir(), "readytogo-address-"));
    const input = join(dir, "source.csv");
    const output = join(dir, "catalog.json");
    const row = [
      "1",
      "同名公厕",
      "东城区",
      "街道",
      "单位",
      "编号",
      scenario.local,
      "116.4",
      "39.9",
      "",
      "二类",
      "",
      "",
      "",
      "现有",
      "0",
      "0",
      "0",
      "1",
      "无",
      "无",
      "无",
      "0",
      "无",
      "无",
      "",
      "",
    ];
    await writeFile(
      input,
      iconv.encode(["序号,厕所名称", row.join(",")].join("\r\n"), "gb18030"),
    );
    const { stdout } = await exec(process.execPath, [
      "--import",
      "tsx",
      "scripts/import-data.ts",
      "--input",
      input,
      "--output",
      output,
    ]);
    const report = JSON.parse(stdout) as ImportReport;
    const poi: ProviderPoi = {
      id: "map-toilet",
      name: "同名公厕",
      address: scenario.address,
      district: "东城区",
      city: "北京市",
      position: { lng: scenario.lng, lat: 39.9, crs: "GCJ02" },
      typeCode: "200300",
      type: "公共设施;公共厕所",
      openingHours: null,
    };
    const provider: AmapProvider = {
      searchPlaces: async () => ({ pois: [], hasMore: false }),
      nearbyToilets: async () => ({ pois: [poi], hasMore: false }),
      walking: async (origin, destination) => ({
        origin,
        destination,
        status: "success",
        walkSeconds: 420,
        walkMeters: 500,
      }),
      convertGps: async (p) => ({ ...p, crs: "GCJ02" }),
    };
    const { app } = await createApplication({
      catalogPath: output,
      matchCachePath: null,
      provider,
      logger: () => {},
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/toilets/search`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            origin: {
              lng: 116.4,
              lat: 39.9,
              crs: "GCJ02",
              label: "出发点",
              source: "place",
            },
            context: "nearby",
            preference: "any",
            walkLimitMinutes: 20,
            includeConditionalAccess: false,
            extendedRadiusKm: 5,
            language: "en",
            queryVersion: 1,
          }),
        },
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as ApiSuccess<SearchResult>;
      const candidate = Object.values(body.data.groups).flat()[0];
      assert.ok(candidate);
      assert.equal(
        candidate.toiletId,
        scenario.matched ? report.sampleToiletIds[0] : "amap_map-toilet",
      );
      assert.equal(
        candidate.seatStatus,
        scenario.matched ? "inferred" : "unknown",
      );
    } finally {
      server.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
}
