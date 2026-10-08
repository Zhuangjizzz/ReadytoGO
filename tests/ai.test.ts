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
    const nextReply = replies.shift();
    const reply = typeof nextReply === "function" ? nextReply(body) : nextReply;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify(reply),
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
    assert.ok(
      body.data.placeQueries.every(
        (place: { note: string; noteKind?: string }) =>
          place.note === originalText && place.noteKind === "source_context",
      ),
    );
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
          },
          {
            toiletId: "no-seat",
            seatInference: null,
            basisFields: ["adultSeated"],
            reason: "A seated toilet may be available.",
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
    assert.equal(improved.nameEn, "Access · Public restroom");
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

test("contradictory source statements stay unknown with a conflict explanation after AI enrichment", async () => {
  const f = await fixture(
    [
      {
        items: [
          {
            toiletId: "conflict",
            seatInference: null,
            basisFields: ["notes"],
            reason: "An adult seated toilet may be available.",
          },
        ],
      },
    ],
    { provider: mapProvider },
    [
      toilet("conflict", "unknown", {
        adultSeated: true,
        notes: "没有成人坐便。",
        accessibility: true,
      }),
    ],
  );
  try {
    const result = await f.search(searchRequest);
    assert.equal(result.analysisStatus, "complete");
    assert.equal(result.groups.matched.length, 0);
    assert.equal(result.groups.otherNearby[0].seatStatus, "unknown");
    assert.match(result.groups.otherNearby[0].reason, /conflict/i);
  } finally {
    await f.close();
  }
});

test("ambiguous matching can select only a recalled local record and preserve its facility data", async () => {
  const local = toilet("local-garden", "inferred", { accessibleRoom: 1 });
  Object.assign(local, {
    nameZh: "滨河公园东门卫生间",
    addressZh: "公园东部",
    position: null,
    sourcePosition: { lng: 116.4001, lat: 39.9, crs: "unknown" },
    poiId: null,
    matchMethod: null,
  });
  const f = await fixture(
    [
      { recordId: "local-garden", basisFields: ["nameZh", "addressZh"] },
      {
        items: [
          ...["parking", "south"].map((id) => ({
            toiletId: `amap_${id}`,
            seatInference: null,
            basisFields: [],
            reason: "Adult seating is unknown.",
          })),
          {
            toiletId: "local-garden",
            seatInference: null,
            basisFields: ["accessibleRoom"],
            reason:
              "An accessible room suggests a seated toilet may be available.",
          },
        ],
      },
    ],
    {
      provider: {
        ...mapProvider,
        nearbyToilets: async () => ({
          pois: [
            ...["parking", "south"].map((id) => ({
              id,
              name: id,
              address: "其他区域",
              district: "东城区",
              city: "北京市",
              position: { lng: 116.4001, lat: 39.9, crs: "GCJ02" as const },
              typeCode: "200300",
              type: "公共厕所",
              openingHours: null,
            })),
            {
              id: "map-garden",
              name: "滨河公园东入口公厕",
              address: "公园东侧",
              district: "东城区",
              city: "北京市",
              position: { lng: 116.4003, lat: 39.9, crs: "GCJ02" },
              typeCode: "200300",
              type: "公共厕所",
              openingHours: null,
            },
          ],
          hasMore: false,
        }),
      },
    },
    [local],
  );
  try {
    const result = await f.search({ ...searchRequest, preference: "any" });
    const all = Object.values(result.groups).flat();
    assert.equal(all.length, 3);
    const matched = all.find(
      (candidate) => candidate.toiletId === "local-garden",
    );
    assert.ok(matched);
    assert.equal(matched.facilities.accessibleRoom, 1);
    assert.equal(matched.position?.lng, 116.4003);
    assert.equal(result.analysisStatus, "complete");
  } finally {
    await f.close();
  }
});

for (const scenario of [
  { name: "a foreign candidate ID", change: { toiletId: "unrecalled-id" } },
  {
    name: "an unknown basis field",
    change: { basisFields: ["verifiedSeating"] },
  },
  {
    name: "a missing basis field value",
    change: { basisFields: ["thirdRestroom"] },
  },
  {
    name: "a zero facility count",
    change: { basisFields: ["accessibleRoom"] },
  },
  {
    name: "model-provided route numbers",
    change: { reason: "A seated toilet is about 2 minutes away." },
  },
]) {
  test(`candidate analysis rejects ${scenario.name} after one repair and retains usable results`, async () => {
    const invalid = {
      items: [
        {
          toiletId: "source",
          seatInference: "inferred",
          basisFields: ["accessibility"],
          reason:
            "Accessibility facilities suggest a seated toilet may be available.",

          ...scenario.change,
        },
      ],
    };
    const f = await fixture([invalid, invalid], { provider: mapProvider }, [
      toilet("source", "unknown", { accessibility: true, accessibleRoom: 0 }),
    ]);
    try {
      const result = await f.search(searchRequest);
      assert.equal(result.analysisStatus, "fallback");
      assert.equal(result.groups.matched.length, 0);
      assert.equal(result.groups.otherNearby[0].toiletId, "source");
      assert.equal(result.groups.otherNearby[0].seatStatus, "unknown");
      assert.equal(result.groups.otherNearby[0].walkSeconds, 301);
      assert.equal(result.pendingWork, false);
      assert.equal(f.upstreamRequests(), 2);
    } finally {
      await f.close();
    }
  });
}

test("an unreturned match ID cannot attach unrelated local facility records", async () => {
  const local = toilet("local-courtyard", "inferred", { thirdRestroom: 1 });
  Object.assign(local, {
    nameZh: "花园庭院北门",
    addressZh: "花园北部",
    position: null,
    sourcePosition: { lng: 116.4001, lat: 39.9, crs: "unknown" },
    poiId: null,
    matchMethod: null,
  });
  const invalidMatch = {
    recordId: "unrecalled-record",
    basisFields: ["nameZh"],
  };
  const f = await fixture(
    [
      invalidMatch,
      invalidMatch,
      {
        items: [
          {
            toiletId: "amap_map-courtyard",
            seatInference: "unknown",
            basisFields: [],
            reason: "Adult seating information is unavailable.",
          },
        ],
      },
    ],
    {
      provider: {
        ...mapProvider,
        nearbyToilets: async () => ({
          pois: [
            {
              id: "map-courtyard",
              name: "花园庭院北入口公厕",
              address: "花园北侧",
              district: "东城区",
              city: "北京市",
              position: { lng: 116.4003, lat: 39.9, crs: "GCJ02" },
              typeCode: "200300",
              type: "公共厕所",
              openingHours: null,
            },
          ],
          hasMore: false,
        }),
      },
    },
    [local],
  );
  try {
    const result = await f.search({ ...searchRequest, preference: "any" });
    const all = Object.values(result.groups).flat();
    assert.equal(all.length, 1);
    assert.equal(all[0].toiletId, "amap_map-courtyard");
    assert.equal(all[0].facilities.thirdRestroom, null);
    assert.equal(result.analysisStatus, "complete");
  } finally {
    await f.close();
  }
});

test("cached analysis preserves query versions and a language change receives its own explanation", async () => {
  const f = await fixture(
    [
      {
        items: [
          {
            toiletId: "memo",
            seatInference: "inferred",
            basisFields: ["accessibility"],
            reason:
              "Accessibility features suggest a seated toilet may be available.",
          },
        ],
      },
      {
        items: [
          {
            toiletId: "memo",
            seatInference: "inferred",
            basisFields: ["accessibility"],
            reason: "无障碍设施提示可能有坐便。",
          },
        ],
      },
    ],
    { provider: mapProvider },
    [toilet("memo", "unknown", { accessibility: true })],
  );
  try {
    await f.search(searchRequest);
    const cached = await f.search({ ...searchRequest, queryVersion: 99 });
    assert.equal(cached.queryVersion, 99);
    assert.equal(cached.analysisStatus, "complete");
    assert.equal(f.upstreamRequests(), 1);
    const chinese = await f.search({
      ...searchRequest,
      language: "zh-CN",
      queryVersion: 100,
    });
    assert.equal(chinese.queryVersion, 100);
    assert.match(chinese.groups.matched[0].reason, /^无障碍设施/);
    assert.equal(f.upstreamRequests(), 2);
  } finally {
    await f.close();
  }
});

test("a rejected field reference can be repaired using its exact bounded feedback and previous JSON", async () => {
  const invalid = {
    items: [
      {
        toiletId: "feedback",
        seatInference: "inferred",
        basisFields: ["accessible facilities"],
        reason: "Accessibility features suggest adult seating.",
      },
    ],
  };
  const corrected = {
    items: [{ ...invalid.items[0], basisFields: ["accessibility"] }],
  };
  let suppliedConcreteFeedback = false;
  const f = await fixture(
    [
      invalid,
      (body: { messages: { role: string; content: string }[] }) => {
        try {
          const previous = JSON.parse(
            body.messages.find((m) => m.role === "assistant")?.content ??
              "null",
          );
          const feedback = JSON.parse(body.messages.at(-1)?.content ?? "null");
          suppliedConcreteFeedback =
            previous?.rejectedResponse === JSON.stringify(invalid) &&
            previous.truncated === false &&
            feedback.validationIssues.some(
              (issue: {
                path: unknown;
                category: string;
                allowedValues?: string[];
              }) =>
                JSON.stringify(issue.path) === '["items",0,"basisFields",0]' &&
                issue.category === "invalid_enum" &&
                issue.allowedValues?.includes("accessibility"),
            ) &&
            /untrusted/i.test(body.messages[0].content);
        } catch {
          suppliedConcreteFeedback = false;
        }
        return suppliedConcreteFeedback ? corrected : invalid;
      },
    ],
    { provider: mapProvider },
    [toilet("feedback", "unknown", { accessibility: true })],
  );
  try {
    const result = await f.search(searchRequest);
    assert.equal(result.analysisStatus, "complete");
    assert.equal(suppliedConcreteFeedback, true);
    assert.equal(f.upstreamRequests(), 2);
    assert.equal(result.groups.matched[0].facilities.accessibility, true);
    assert.equal(result.groups.matched[0].facilities.accessibleRoom, null);
    assert.equal(result.groups.matched[0].walkSeconds, 301);
    assert.equal(result.groups.matched[0].walkMeters, 421);
  } finally {
    await f.close();
  }
});

test("repair feedback distinguishes an absent candidate field from a protected source fact", async () => {
  for (const scenario of [
    {
      id: "absent",
      facilities: { accessibility: true },
      invalidInference: "inferred",
      invalidBasis: ["accessibleRoom"],
      expectedCategory: "missing_evidence",
      expectedPath: '["items",0,"basisFields",0]',
      validInference: "inferred",
      validBasis: ["accessibility"],
      expectedSeat: "inferred",
    },
    {
      id: "denied",
      facilities: { accessibility: true, adultSeated: false },
      invalidInference: "inferred",
      invalidBasis: ["accessibility"],
      expectedCategory: "preserve_source",
      expectedPath: '["items",0,"seatInference"]',
      validInference: null,
      validBasis: ["adultSeated"],
      expectedSeat: "unavailable",
    },
  ]) {
    const invalid = {
      items: [
        {
          toiletId: scenario.id,
          seatInference: scenario.invalidInference,
          basisFields: scenario.invalidBasis,
          reason: "Accessibility features suggest adult seating.",
        },
      ],
    };
    let contextualFeedback = false;
    const f = await fixture(
      [
        invalid,
        (body: { messages: { role: string; content: string }[] }) => {
          try {
            const feedback = JSON.parse(
              body.messages.at(-1)?.content ?? "null",
            );
            contextualFeedback = feedback.validationIssues.some(
              (issue: { path: unknown; category: string }) =>
                JSON.stringify(issue.path) === scenario.expectedPath &&
                issue.category === scenario.expectedCategory,
            );
          } catch {
            contextualFeedback = false;
          }
          return contextualFeedback
            ? {
                items: [
                  {
                    ...invalid.items[0],
                    seatInference: scenario.validInference,
                    basisFields: scenario.validBasis,
                  },
                ],
              }
            : invalid;
        },
      ],
      { provider: mapProvider },
      [toilet(scenario.id, "unknown", scenario.facilities)],
    );
    try {
      const result = await f.search(searchRequest);
      assert.equal(result.analysisStatus, "complete");
      assert.equal(contextualFeedback, true);
      const candidate = Object.values(result.groups).flat()[0];
      assert.equal(candidate.seatStatus, scenario.expectedSeat);
      assert.equal(candidate.walkSeconds, 301);
      assert.equal(candidate.walkMeters, 421);
      assert.equal(
        candidate.facilities.adultSeated,
        scenario.facilities.adultSeated ?? null,
      );
    } finally {
      await f.close();
    }
  }
});

test("a second invalid answer still falls back after concrete repair feedback", async () => {
  const invalid = {
    items: [
      {
        toiletId: "still-invalid",
        seatInference: "inferred",
        basisFields: ["nonexistentField"],
        reason: "A seated toilet may be available.",
      },
    ],
  };
  let repairReceived = false;
  const f = await fixture(
    [
      invalid,
      (body: { messages: { role: string; content: string }[] }) => {
        const feedback = JSON.parse(body.messages.at(-1)?.content ?? "null");
        repairReceived = feedback.validationIssues.some(
          (issue: { category: string }) => issue.category === "invalid_enum",
        );
        return invalid;
      },
      { items: [] },
    ],
    { provider: mapProvider },
    [toilet("still-invalid", "unknown", { accessibility: true })],
  );
  try {
    const result = await f.search(searchRequest);
    assert.equal(repairReceived, true);
    assert.equal(f.upstreamRequests(), 2);
    assert.equal(result.analysisStatus, "fallback");
    assert.equal(result.groups.matched.length, 0);
    assert.equal(result.groups.otherNearby[0].seatStatus, "unknown");
    assert.equal(result.groups.otherNearby[0].walkSeconds, 301);
    assert.equal(result.groups.otherNearby[0].facilities.accessibility, true);
  } finally {
    await f.close();
  }
});

test("repair context is bounded and rejected output stays quoted outside instructions and logs", async () => {
  const marker = "UNTRUSTED_REJECTED_OUTPUT_MARKER";
  const invalid = {
    items: Array.from({ length: 30 }, (_, i) => ({
      toiletId: `oversized-${i}`,
      seatInference: "invalid",
      basisFields: ["invalid"],
      reason: marker.repeat(500),
    })),
  };
  const corrected = {
    items: [
      {
        toiletId: "bounded",
        seatInference: null,
        basisFields: [],
        reason: "Adult seating information is unknown.",
      },
    ],
  };
  let bounded = false;
  const logs: unknown[] = [];
  const f = await fixture(
    [
      invalid,
      (body: { messages: { role: string; content: string }[] }) => {
        const previous = JSON.parse(
          body.messages.find((m) => m.role === "assistant")?.content ?? "null",
        );
        const feedback = JSON.parse(body.messages.at(-1)?.content ?? "null");
        bounded =
          previous?.truncated === true &&
          previous.rejectedResponse.length === 12000 &&
          feedback.validationIssues.length === 16 &&
          !body.messages[0].content.includes(marker) &&
          !JSON.stringify(feedback).includes(marker);
        return bounded ? corrected : invalid;
      },
    ],
    { provider: mapProvider, logger: (entry) => logs.push(entry) },
    [toilet("bounded", "unknown", {})],
  );
  try {
    const result = await f.search(searchRequest);
    assert.equal(result.analysisStatus, "complete");
    assert.equal(bounded, true);
    assert.equal(f.upstreamRequests(), 2);
    assert.equal(JSON.stringify(logs).includes(marker), false);
    assert.equal(result.groups.otherNearby[0].walkMeters, 421);
  } finally {
    await f.close();
  }
});

test("the initial output and its repair still share one analysis deadline", async () => {
  let calls = 0;
  const invalid = {
    items: [
      {
        toiletId: "deadline",
        seatInference: "inferred",
        basisFields: ["unknownField"],
        reason: "A seated toilet may be available.",
      },
    ],
  };
  const corrected = {
    items: [{ ...invalid.items[0], basisFields: ["accessibility"] }],
  };
  const f = await fixture(
    [],
    {
      provider: mapProvider,
      aiAnalysisTimeoutMs: 45,
      model: {
        complete: async (input) => {
          calls++;
          await new Promise((resolve) => setTimeout(resolve, 30));
          return JSON.stringify(input.repair ? corrected : invalid);
        },
      },
    },
    [toilet("deadline", "unknown", { accessibility: true })],
  );
  try {
    const result = await f.search(searchRequest);
    assert.equal(calls, 2);
    assert.equal(result.analysisStatus, "fallback");
    assert.equal(result.pendingWork, false);
    assert.equal(result.groups.otherNearby[0].walkSeconds, 301);
  } finally {
    await f.close();
  }
});

test("itinerary notes retain surrounding source text when the model omits a relative-time phrase", async () => {
  const text = "Before the concert, visit City Gallery.";
  const f = await fixture([
    {
      proposedPreference: null,
      preferenceEvidence: null,
      placeQueries: [
        {
          order: 1,
          originalText: "City Gallery",
          queryZh: "城市画廊",
          note: null,
        },
      ],
      unsupportedNeeds: [],
      warnings: [],
    },
  ]);
  try {
    const { body } = await f.post(text);
    assert.equal(body.data.status, "complete");
    assert.equal(body.data.placeQueries[0].note, text);
    assert.equal(body.data.placeQueries[0].noteKind, "source_context");
    assert.equal(body.data.placeQueries.length, 1);
    assert.equal(f.upstreamRequests(), 1);
  } finally {
    await f.close();
  }
});

const sourceContextCases = [
  {
    name: "different times in one sentence",
    text: "City Gallery at 09:15, then Riverside Park at 13:45.",
    places: ["City Gallery", "Riverside Park"],
  },
  {
    name: "a date before several visits",
    text: "Tomorrow:\nCity Gallery; Riverside Park",
    places: ["City Gallery", "Riverside Park"],
  },
  {
    name: "a remark applying to several visits",
    text: "City Gallery; Riverside Park. Both after lunch.",
    places: ["City Gallery", "Riverside Park"],
  },
  {
    name: "Chinese dates with repeated visits",
    text: "11月3日\n上午九点参观市立图书馆，下午去河畔公园，晚饭前回市立图书馆。",
    places: ["市立图书馆", "河畔公园", "市立图书馆"],
  },
  {
    name: "a date on a separate line between visits",
    text: "City Gallery\nOctober 12\nRiverside Park",
    places: ["City Gallery", "Riverside Park"],
  },
  {
    name: "punctuation within verified names and abbreviations",
    text: "At 9 a.m., Gallery; Annex. After that, St. Mary's Park.",
    places: ["Gallery; Annex", "St. Mary's Park"],
  },
  {
    name: "meaningful symbols around a place list",
    text: "🏃 City Gallery → Riverside Park ♿",
    places: ["City Gallery", "Riverside Park"],
  },
  {
    name: "uncertainty punctuation",
    text: "City Gallery? Riverside Park?",
    places: ["City Gallery", "Riverside Park"],
  },
  {
    name: "the entire 2000-character source",
    text: `City Gallery\n${"行程备注".repeat(496)}末尾。`,
    places: ["City Gallery"],
  },
];
for (const example of sourceContextCases)
  test(`itinerary source context preserves ${example.name} without attributing or inventing notes`, async () => {
    const f = await fixture([
      {
        proposedPreference: null,
        preferenceEvidence: null,
        placeQueries: example.places.map((originalText, index) => ({
          order: index + 1,
          originalText,
          queryZh: originalText,
          note: "An invented arrival appointment. ".repeat(30),
        })),
        unsupportedNeeds: [],
        warnings: [],
      },
    ]);
    try {
      const { status, body } = await f.post(example.text);
      assert.equal(status, 200);
      assert.equal(body.data.status, "complete");
      assert.deepEqual(
        body.data.placeQueries.map(
          (place: { originalText: string }) => place.originalText,
        ),
        example.places,
      );
      for (const place of body.data.placeQueries) {
        assert.equal(place.note, example.text);
        assert.equal(place.noteKind, "source_context");
      }
      assert.equal(f.upstreamRequests(), 1);
    } finally {
      await f.close();
    }
  });

for (const example of [
  { text: "City Gallery", places: ["City Gallery"] },
  {
    text: "City Gallery, Riverside Park, City Gallery",
    places: ["City Gallery", "Riverside Park", "City Gallery"],
  },
  {
    text: "City Gallery → Riverside Park;\nCity Gallery。",
    places: ["City Gallery", "Riverside Park", "City Gallery"],
  },
  {
    text: "Gallery; Annex / St. Mary's Park",
    places: ["Gallery; Annex", "St. Mary's Park"],
  },
])
  test(`a pure itinerary place list has no synthesized note: ${example.text}`, async () => {
    const f = await fixture([
      {
        proposedPreference: null,
        preferenceEvidence: null,
        placeQueries: example.places.map((originalText, index) => ({
          order: index + 1,
          originalText,
          queryZh: originalText,
          note: "The model invented a time.",
        })),
        unsupportedNeeds: [],
        warnings: [],
      },
    ]);
    try {
      const { body } = await f.post(example.text);
      assert.equal(body.data.status, "complete");
      assert.equal(body.data.placeQueries.length, example.places.length);
      for (const place of body.data.placeQueries) {
        assert.equal(place.note, null);
        assert.equal(place.noteKind, undefined);
      }
      assert.equal(f.upstreamRequests(), 1);
    } finally {
      await f.close();
    }
  });

test("source context does not create places or change a supported preference proposal", async () => {
  const evidence = "I do not need a seated toilet.";
  for (const hasPlace of [false, true]) {
    const text = hasPlace ? `Visit City Gallery. ${evidence}` : evidence;
    const f = await fixture([
      {
        proposedPreference: "any",
        preferenceEvidence: evidence,
        placeQueries: hasPlace
          ? [
              {
                order: 1,
                originalText: "City Gallery",
                queryZh: "城市画廊",
                note: null,
              },
            ]
          : [],
        unsupportedNeeds: [],
        warnings: [],
      },
    ]);
    try {
      const { body } = await f.post(text);
      assert.equal(body.data.status, "complete");
      assert.equal(body.data.proposedPreference, "any");
      assert.equal(body.data.placeQueries.length, hasPlace ? 1 : 0);
      if (hasPlace) assert.equal(body.data.placeQueries[0].note, text);
      assert.equal(f.upstreamRequests(), 1);
    } finally {
      await f.close();
    }
  }
});

test("the model cannot set the software-owned source-context label", async () => {
  const text = "Before dinner, City Gallery.";
  const valid = {
    proposedPreference: null,
    preferenceEvidence: null,
    placeQueries: [
      {
        order: 1,
        originalText: "City Gallery",
        queryZh: "城市画廊",
        note: null,
      },
    ],
    unsupportedNeeds: [],
    warnings: [],
  };
  const f = await fixture([
    {
      ...valid,
      placeQueries: [{ ...valid.placeQueries[0], noteKind: "source_context" }],
    },
    valid,
  ]);
  try {
    const { body } = await f.post(text);
    assert.equal(body.data.status, "complete");
    assert.equal(body.data.placeQueries[0].note, text);
    assert.equal(body.data.placeQueries[0].noteKind, "source_context");
    assert.equal(f.upstreamRequests(), 2);
  } finally {
    await f.close();
  }
});
