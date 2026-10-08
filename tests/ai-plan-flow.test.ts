import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApplication } from "../src/server/app.js";
import type { AmapProvider } from "../src/server/providers/amap.js";
import type { JsonModel } from "../src/server/providers/qwen.js";
import type {
  ApiSuccess,
  ItineraryParseResult,
  Place,
  PlanPreviewResult,
} from "../src/shared/contracts.js";

test("public parse, map search and preview endpoints preserve confirmed places and use current-language analysis", async () => {
  const directory = await mkdtemp(join(tmpdir(), "readytogo-ai-plan-"));
  const catalogPath = join(directory, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({ schemaVersion: 1, report: {}, toilets: [] }),
  );
  const searches: string[] = [];
  const analyzed: { language: string; context: string }[] = [];
  const provider: AmapProvider = {
    searchPlaces: async (query) => {
      searches.push(query);
      const index = query === "河岸书屋" ? 0 : 1;
      return {
        pois: [
          {
            id: `place-${index}`,
            name: query,
            address: `街道${index + 1}号`,
            district: "东城区",
            city: "北京市",
            position: { lng: 116.4 + index * 0.005, lat: 39.9, crs: "GCJ02" },
            typeCode: "140100",
            type: "文化场所",
            openingHours: null,
          },
        ],
        hasMore: false,
      };
    },
    nearbyToilets: async (origin) => ({
      pois: [
        {
          id: `toilet-${origin.lng}`,
          name: "公共卫生间",
          address: "文化街入口",
          district: "东城区",
          city: "北京市",
          position: { lng: origin.lng + 0.0002, lat: 39.9, crs: "GCJ02" },
          typeCode: "200300",
          type: "公共厕所",
          openingHours: null,
        },
      ],
      hasMore: false,
    }),
    walking: async (origin, destination) => ({
      origin,
      destination,
      status: "success",
      walkSeconds: 345,
      walkMeters: 432,
    }),
    convertGps: async (position) => ({ ...position, crs: "GCJ02" }),
  };
  const model: JsonModel = {
    complete: async ({ data }) => {
      const input = data as {
        text?: string;
        language: string;
        context: string;
        candidates?: { toiletId: string }[];
      };
      if (input.text)
        return JSON.stringify({
          proposedPreference: "any",
          preferenceEvidence: "不用坐便",
          placeQueries: [
            {
              order: 1,
              originalText: "河岸书屋",
              queryZh: "河岸书屋",
              note: null,
            },
            {
              order: 2,
              originalText: "旧城展馆",
              queryZh: "旧城展馆",
              note: null,
            },
          ],
          unsupportedNeeds: [],
          warnings: [],
        });
      analyzed.push({ language: input.language, context: input.context });
      return JSON.stringify({
        items: input.candidates?.map((candidate) => ({
          toiletId: candidate.toiletId,
          seatInference: null,
          basisFields: [],
          reason:
            input.language === "zh-CN"
              ? "设施信息仍待补充"
              : "Facility information is limited.",
        })),
      });
    },
  };
  const { app } = await createApplication({
    catalogPath,
    matchCachePath: null,
    provider,
    model,
    logger: () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const post = async <T>(path: string, body: unknown) => {
    const response = await fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as ApiSuccess<T>).data;
  };
  try {
    const parsed = await post<ItineraryParseResult>("/assist/parse", {
      text: "先去河岸书屋，再去旧城展馆，不用坐便。",
      mode: "itinerary",
      language: "zh-CN",
      preference: "seated_required",
    });
    assert.equal(parsed.proposedPreference, "any");
    const stops = [];
    for (const item of parsed.placeQueries) {
      const reply = await fetch(
        `${base}/places/search?${new URLSearchParams({ q: item.queryZh, language: "zh-CN", city: "beijing" })}`,
      );
      const body = (await reply.json()) as ApiSuccess<{ places: Place[] }>;
      stops.push({
        stopId: `confirmed-${item.order}`,
        place: body.data.places[0],
      });
    }
    assert.deepEqual(searches, ["河岸书屋", "旧城展馆"]);
    const request = {
      revision: 7,
      stops,
      language: "zh-CN",
      preference: parsed.proposedPreference,
      includeConditionalAccess: false,
      walkLimitMinutes: 10,
      extendedRadiusKm: 5,
    };
    const result = await post<PlanPreviewResult>("/plans/preview", request);
    assert.deepEqual(
      result.stops.map((stop) => stop.stopId),
      ["confirmed-1", "confirmed-2"],
    );
    assert.deepEqual(
      result.stops.map((stop) => stop.result!.origin.lng),
      [116.4, 116.405],
    );
    for (const stop of result.stops) {
      assert.equal(stop.result!.analysisStatus, "complete");
      assert.equal(stop.primary!.walkSeconds, 345);
      assert.equal(stop.primary!.walkMeters, 432);
      assert.match(stop.primary!.reason, /设施信息仍待补充/);
    }
    const english = await post<PlanPreviewResult>("/plans/preview", {
      ...request,
      language: "en",
      revision: 8,
    });
    assert.match(
      english.stops[0].primary!.reason,
      /Facility information is limited/,
    );
    assert.equal(english.revision, 8);
    assert.ok(
      analyzed.some(
        (input) => input.context === "plan_stop" && input.language === "zh-CN",
      ),
    );
    assert.ok(
      analyzed.some(
        (input) => input.context === "plan_stop" && input.language === "en",
      ),
    );
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
