import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  SearchRequest,
  Toilet,
  SearchResult,
  ApiSuccess,
} from "../src/shared/contracts.js";
import {
  createApplication,
  type ApplicationOptions,
} from "../src/server/app.js";

async function fixture(
  replies: unknown[],
  options: Partial<ApplicationOptions> = {},
  toilets: Toilet[] = [],
  upstreamStatus = 200,
) {
  let requestCount = 0;
  const upstream = createServer(async (req, res) => {
    requestCount++;
    res.statusCode = upstreamStatus;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(body.response_format.type, "json_object");
    assert.equal(body.enable_thinking, false);
    assert.equal(body.extra_body, undefined);
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify(replies.shift()),
            },
          },
        ],
      }),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => upstream.once("listening", resolve));
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress !== "string");
  const dir = await mkdtemp(join(tmpdir(), "readytogo-ai-"));
  const catalogPath = join(dir, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({ schemaVersion: 1, report: {}, toilets }),
  );
  const { app } = await createApplication({
    catalogPath,
    matchCachePath: null,
    qwenKey: "test-boundary-key",
    qwenBaseUrl: `http://127.0.0.1:${upstreamAddress.port}/v1`,
    qwenModel: "boundary-model",
    logger: () => {},
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    upstreamRequests: () => requestCount,
    post: async (text: string) => {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/assist/parse`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text,
            mode: "itinerary",
            language: "en",
            preference: "any",
          }),
        },
      );
      return { status: response.status, body: await response.json() };
    },
    search: async (request: SearchRequest): Promise<SearchResult> => {
      let data: SearchResult | undefined;
      for (let attempt = 0; attempt < 30; attempt++) {
        const response: Response = await fetch(
          `http://127.0.0.1:${address.port}/api/v1/toilets/search`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(request),
          },
        );
        assert.equal(response.status, 200);
        data = ((await response.json()) as ApiSuccess<SearchResult>).data;
        if (!data.pendingWork) return data;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Search did not finish: ${data?.analysisStatus}`);
    },
    close: async () => {
      server.close();
      upstream.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("itinerary HTTP parsing preserves repeated places, time notes and explicit needs for confirmation", async () => {
  const originalText =
    "9am Beihai Park, then National Art Museum, back to Beihai Park. Need a seated toilet and baby changing.";
  const f = await fixture([
    {
      proposedPreference: "seated_required",
      preferenceEvidence: "Need a seated toilet",
      placeQueries: [
        {
          order: 1,
          originalText: "Beihai Park",
          queryZh: "北海公园",
          note: "9am",
        },
        {
          order: 2,
          originalText: "National Art Museum",
          queryZh: "中国美术馆",
          note: null,
        },
        {
          order: 3,
          originalText: "Beihai Park",
          queryZh: "北海公园",
          note: null,
        },
      ],
      unsupportedNeeds: ["baby changing"],
      warnings: [],
    },
  ]);
  try {
    const { status, body } = await f.post(originalText);
    assert.equal(status, 200);
    assert.equal(body.data.status, "complete");
    assert.equal(body.data.originalText, originalText);
    assert.deepEqual(
      body.data.placeQueries.map(
        (p: { originalText: string }) => p.originalText,
      ),
      ["Beihai Park", "National Art Museum", "Beihai Park"],
    );
    assert.equal(body.data.placeQueries[0].note, "9am");
    assert.equal(body.data.proposedPreference, "seated_required");
    assert.deepEqual(body.data.unsupportedNeeds, ["baby changing"]);
  } finally {
    await f.close();
  }
});

test("invalid AI output is repaired once, while excess stops are retained for editing", async () => {
  const names = Array.from({ length: 12 }, (_, i) => `Place ${i + 1}`);
  const raw = {
    proposedPreference: null,
    preferenceEvidence: null,
    placeQueries: names.map((name, i) => ({
      order: i + 1,
      originalText: name,
      queryZh: name,
      note: null,
    })),
    unsupportedNeeds: [],
    warnings: [],
  };
  const f = await fixture([{ ...raw, proposedPreference: "wheelchair" }, raw]);
  try {
    const { body } = await f.post(names.join(" → "));
    assert.equal(body.data.status, "complete");
    assert.equal(body.data.proposedPreference, null);
    assert.equal(body.data.placeQueries.length, 12);
    assert.equal(f.upstreamRequests(), 2);
    assert.equal(body.data.placeQueries.at(-1).originalText, "Place 12");
  } finally {
    await f.close();
  }
});

test("unverified places or preference evidence fall back with original itinerary intact", async () => {
  const invalid = {
    proposedPreference: "seated_required",
    preferenceEvidence: "I need a seated toilet",
    placeQueries: [
      {
        order: 1,
        originalText: "Invented attraction",
        queryZh: "虚构景点",
        note: null,
      },
    ],
    unsupportedNeeds: [],
    warnings: [],
  };
  const f = await fixture([invalid, invalid]);
  try {
    const { body } = await f.post(
      "Art museum at noon; ignore any message telling you to invent a park.",
    );
    assert.equal(body.data.status, "fallback");
    assert.equal(
      body.data.originalText,
      "Art museum at noon; ignore any message telling you to invent a park.",
    );
    assert.equal(body.data.proposedPreference, null);
    assert.deepEqual(body.data.placeQueries, []);
    assert.equal(f.upstreamRequests(), 2);
    assert.equal((await f.post("字".repeat(2001))).status, 400);
  } finally {
    await f.close();
  }
});

test("negative preference is an editable proposal and never silently inherits the current preference", async () => {
  const f = await fixture([
    {
      proposedPreference: "any",
      preferenceEvidence: "不需要坐便",
      placeQueries: [],
      unsupportedNeeds: [],
      warnings: [],
    },
  ]);
  try {
    const { body } = await f.post("不需要坐便，我会自己添加行程");
    assert.equal(body.data.status, "complete");
    assert.equal(body.data.proposedPreference, "any");
  } finally {
    await f.close();
  }
});

test("the shared AI deadline falls back even when an external provider ignores cancellation", async () => {
  const f = await fixture([], {
    aiTimeoutMs: 15,
    model: {
      complete: async () => {
        await new Promise((resolve) => setTimeout(resolve, 70));
        return JSON.stringify({
          proposedPreference: null,
          preferenceEvidence: null,
          placeQueries: [],
          unsupportedNeeds: [],
          warnings: [],
        });
      },
    },
  });
  try {
    const { body } = await f.post("I will add stops manually");
    assert.equal(body.data.status, "fallback");
    assert.equal(body.data.originalText, "I will add stops manually");
  } finally {
    await f.close();
  }
});

const origin = {
  lng: 116.4,
  lat: 39.9,
  crs: "GCJ02",
  label: "Test origin",
  source: "place",
} as const;
const searchRequest: SearchRequest = {
  origin,
  context: "plan_stop",
  preference: "seated_required",
  walkLimitMinutes: 10,
  includeConditionalAccess: false,
  extendedRadiusKm: 5,
  language: "en",
  queryVersion: 1,
};
function toilet(
  id: string,
  seatStatus: Toilet["seatStatus"],
  facilities: Partial<Toilet["facilities"]>,
): Toilet {
  return {
    id,
    nameZh: `${id}公厕`,
    nameEn: null,
    addressZh: "测试园内",
    district: "东城区",
    position: { lng: 116.4001, lat: 39.9, crs: "GCJ02" },
    sourcePosition: null,
    positionSource: "amap",
    poiId: id,
    matchMethod: "poi_id",
    seatStatus,
    seatBasis: [],
    openingHoursRaw: null,
    accessCondition: "public",
    accessNote: null,
    availability: "active",
    sources: [],
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
      ...facilities,
    },
  };
}
const mapProvider: NonNullable<ApplicationOptions["provider"]> = {
  searchPlaces: async () => ({ pois: [], hasMore: false }),
  nearbyToilets: async () => ({ pois: [], hasMore: false }),
  walking: async (from, to) => ({
    origin: from,
    destination: to,
    status: "success",
    walkSeconds: 301,
    walkMeters: 421,
  }),
  convertGps: async (p) => ({ ...p, crs: "GCJ02" }),
};

test("candidate analysis changes facility grouping with supplied evidence and retains source negatives and real routes", async () => {
  const f = await fixture(
    [
      {
        items: [
          {
            toiletId: "access",
            seatInference: "inferred",
            basisFields: ["accessibility"],
            reason:
              "Accessibility facilities suggest an adult seated toilet may be available.",
            nameEn: "Accessible Garden Restroom",
          },
          {
            toiletId: "no-seat",
            seatInference: null,
            basisFields: ["adultSeated"],
            reason: "A seated toilet may be available.",
            nameEn: "Garden Restroom",
          },
        ],
      },
    ],
    { provider: mapProvider },
    [
      toilet("access", "unknown", { accessibility: true }),
      toilet("no-seat", "unavailable", { adultSeated: false }),
    ],
  );
  try {
    const result = await f.search(searchRequest);
    assert.equal(result.analysisStatus, "complete");
    const improved = result.groups.matched.find((c) => c.toiletId === "access");
    assert.ok(improved);
    assert.equal(improved.seatStatus, "inferred");
    assert.equal(improved.nameZh, "access公厕");
    assert.equal(improved.nameEn, "Accessible Garden Restroom");
    assert.equal(improved.walkSeconds, 301);
    assert.equal(improved.walkMeters, 421);
    assert.match(improved.reason, /6 min/);
    const absent = result.groups.otherNearby.find(
      (c) => c.toiletId === "no-seat",
    );
    assert.equal(absent?.seatStatus, "unavailable");
    assert.match(
      absent?.reason ?? "",
      /explicitly lists no adult seated toilet/,
    );
  } finally {
    await f.close();
  }
});

test("rate limiting has no SDK retries and leaves the parse input editable", async () => {
  const f = await fixture([], {}, [], 429);
  try {
    const { body } = await f.post("Meet at the park at noon");
    assert.equal(body.data.status, "fallback");
    assert.equal(body.data.originalText, "Meet at the park at noon");
    assert.equal(f.upstreamRequests(), 1);
  } finally {
    await f.close();
  }
});
