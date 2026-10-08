import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import { readFile } from "node:fs/promises";
import type {
  Candidate,
  CandidateGroups,
  ItineraryParseResult,
  Place,
  PlanLocal,
  PlanPreviewRequest,
  SearchResult,
} from "../../src/shared/contracts.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://isolated-ai-plan.invalid/plan",
});
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  localStorage: dom.window.localStorage,
  history: dom.window.history,
  getComputedStyle: dom.window.getComputedStyle,
}))
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true,
  });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  writable: true,
  configurable: true,
});
dom.window.scrollTo = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
const { render, screen, within, waitFor, cleanup, act, fireEvent } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: App } = await import("../../src/client/App.js");
const { PlacePicker } = await import("../../src/client/PlacePicker.js");
const existing: Place = {
  provider: "amap",
  poiId: "original",
  nameZh: "原有景点",
  nameEn: null,
  addressZh: "原路",
  district: "东城区",
  city: "北京市",
  position: { lng: 116.4, lat: 39.9, crs: "GCJ02" },
  originType: "poi",
};
const places: Place[] = [
  { ...existing, poiId: "garden", nameZh: "植物园入口", addressZh: "园路1号" },
  {
    ...existing,
    poiId: "gallery",
    nameZh: "画廊入口",
    addressZh: "艺路2号",
    position: { ...existing.position, lng: 116.41 },
  },
];
const input = "Morning garden, then art gallery.";
function parsed(text = input): ItineraryParseResult {
  return {
    status: "complete",
    originalText: text,
    proposedPreference: null,
    placeQueries: [
      { order: 1, originalText: "garden", queryZh: "植物园", note: "Morning" },
      { order: 2, originalText: "art gallery", queryZh: "画廊", note: null },
    ],
    unsupportedNeeds: ["Wheelchair routes are not a dedicated filter."],
    warnings: [],
  };
}
function respond(data: unknown) {
  return new Response(
    JSON.stringify({ requestId: "offline", data, warnings: [] }),
    { headers: { "content-type": "application/json" } },
  );
}
function emptyPreview(request: PlanPreviewRequest) {
  return {
    revision: request.revision,
    status: "complete",
    stops: request.stops.map((s) => ({
      stopId: s.stopId,
      primary: null,
      alternatives: [],
      error: null,
      warnings: [],
      result: {
        status: "empty",
        queryVersion: request.revision,
        origin: { ...s.place.position, label: s.place.nameZh, source: "place" },
        groups: {
          matched: [],
          farther: [],
          otherNearby: [],
          conditionalAccess: [],
          routeUnknown: [],
        },
        analysisStatus: "complete",
        summary: "",
        pendingWork: false,
        hasMore: false,
        nextCursor: null,
        batchCursor: "batch",
      },
    })),
  };
}
function setup() {
  cleanup();
  history.replaceState(null, "", "/plan");
  localStorage.clear();
  localStorage.setItem(
    "readytogo-plan",
    JSON.stringify({
      schemaVersion: 1,
      language: "en",
      preference: "seated_required",
      includeConditionalAccess: false,
      walkLimitMinutes: 10,
      extendedRadiusKm: 5,
      revision: 1,
      stops: [
        {
          stopId: "original-stop",
          place: existing,
          selectedToiletId: "chosen",
          skipped: true,
        },
      ],
      updatedAt: "2026-10-08T00:00:00Z",
    }),
  );
}
function saved(): PlanLocal {
  return JSON.parse(localStorage.getItem("readytogo-plan")!);
}
async function fill(user: ReturnType<typeof userEvent.setup>, text = input) {
  await user.type(
    screen.getByRole("textbox", { name: "Your itinerary" }),
    text,
  );
  await user.click(
    screen.getByRole("button", { name: "Use AI to fill stops" }),
  );
}

test("AI draft selects actual map places and leaves the original plan untouched until confirmation", async () => {
  setup();
  const before = localStorage.getItem("readytogo-plan");
  globalThis.fetch = async (url, options) =>
    String(url).includes("/assist/parse")
      ? respond(parsed())
      : String(url).includes("/places/search")
        ? respond({ places, hasMore: false })
        : respond(emptyPreview(JSON.parse(String(options?.body))));
  const user = userEvent.setup();
  const view = render(<App />);
  await fill(user);
  const first = await screen.findByRole("region", { name: "Draft stop 1" });
  const second = screen.getByRole("region", { name: "Draft stop 2" });
  await user.click(
    await within(first).findByRole("button", { name: /Use 植物园入口/ }),
  );
  await user.click(
    await within(second).findByRole("button", { name: /Use 画廊入口/ }),
  );
  assert.equal(localStorage.getItem("readytogo-plan"), before);
  assert.ok(screen.getByText(/Wheelchair routes/));
  await user.click(
    screen.getByRole("button", { name: "Confirm and replace my plan" }),
  );
  await waitFor(() => assert.equal(window.location.pathname, "/plan/result"));
  assert.deepEqual(
    saved().stops.map((s) => s.place.poiId),
    ["garden", "gallery"],
  );
  assert.equal(saved().preference, "seated_required");
  assert.equal(saved().stops[0].note, "Morning");
  assert.equal(saved().stops[0].selectedToiletId, undefined);
  view.unmount();
});

test("a late parse cannot replace text or draft after the user changes input or current preference", async () => {
  setup();
  let release!: (response: Response) => void;
  globalThis.fetch = async () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const user = userEvent.setup();
  const view = render(<App />);
  await fill(user);
  await user.type(
    screen.getByRole("textbox", { name: "Your itinerary" }),
    " Evening stroll.",
  );
  await act(async () => release(respond(parsed())));
  assert.equal(!!screen.queryByRole("region", { name: "Draft stop 1" }), false);
  assert.equal(
    (
      screen.getByRole("textbox", {
        name: "Your itinerary",
      }) as HTMLTextAreaElement
    ).value,
    input + " Evening stroll.",
  );
  await user.click(
    screen.getByRole("button", { name: "Use AI to fill stops" }),
  );
  await user.click(screen.getByRole("button", { name: "No preference" }));
  await act(async () => release(respond(parsed(input + " Evening stroll."))));
  assert.equal(!!screen.queryByRole("region", { name: "Draft stop 1" }), false);
  assert.equal(saved().preference, "any");
  assert.equal(saved().stops[0].selectedToiletId, "chosen");
  assert.equal(saved().stops[0].skipped, true);
  view.unmount();
});

test("editing and removing draft rows prevents delayed place searches from overwriting the new selection", async () => {
  setup();
  const old: { resolve: (response: Response) => void }[] = [];
  const replacement = { ...places[1], poiId: "new-gate", nameZh: "新选择入口" };
  globalThis.fetch = async (url) =>
    String(url).includes("/assist/parse")
      ? respond(parsed())
      : String(url).includes(encodeURIComponent("新入口"))
        ? respond({ places: [replacement], hasMore: false })
        : new Promise((resolve) => old.push({ resolve }));
  const user = userEvent.setup();
  const view = render(<App />);
  await fill(user);
  await waitFor(() => assert.equal(old.length, 2));
  const first = screen.getByRole("region", { name: "Draft stop 1" });
  const query = within(first).getByRole("textbox", {
    name: "Search name for stop 1",
  });
  await user.clear(query);
  await user.type(query, "新入口");
  await user.click(
    within(first).getByRole("button", { name: "Search matches" }),
  );
  await user.click(
    await within(first).findByRole("button", { name: /Use 新选择入口/ }),
  );
  await user.click(
    within(screen.getByRole("region", { name: "Draft stop 2" })).getByRole(
      "button",
      { name: "Remove draft stop" },
    ),
  );
  await act(async () => {
    for (const reply of old) reply.resolve(respond({ places, hasMore: false }));
  });
  assert.equal(screen.queryByRole("region", { name: "Draft stop 2" }), null);
  assert.ok(within(first).getByText(/Selected place: 新选择入口/));
  assert.equal(
    within(first).queryByRole("button", { name: /Use 植物园入口/ }),
    null,
  );
  assert.equal(saved().stops[0].place.poiId, "original");
  view.unmount();
});

test("AI fallback keeps the text, existing draft selections and original plan usable", async () => {
  setup();
  let fail = false;
  globalThis.fetch = async (url) =>
    String(url).includes("/assist/parse")
      ? respond(
          fail
            ? {
                ...parsed(),
                status: "fallback",
                placeQueries: [],
                warnings: ["Unavailable"],
              }
            : parsed(),
        )
      : respond({ places, hasMore: false });
  const user = userEvent.setup();
  const view = render(<App />);
  await fill(user);
  const first = await screen.findByRole("region", { name: "Draft stop 1" });
  await user.click(
    await within(first).findByRole("button", { name: /Use 植物园入口/ }),
  );
  fail = true;
  await user.click(
    screen.getByRole("button", { name: "Use AI to fill stops" }),
  );
  assert.ok(await screen.findByText(/AI is temporarily unavailable/));
  assert.ok(within(first).getByText(/Selected place: 植物园入口/));
  assert.equal(
    (
      screen.getByRole("textbox", {
        name: "Your itinerary",
      }) as HTMLTextAreaElement
    ).value,
    input,
  );
  assert.equal(saved().stops[0].stopId, "original-stop");
  await user.click(screen.getByRole("button", { name: "Keep current plan" }));
  assert.equal(!!screen.queryByRole("region", { name: "Draft stop 1" }), false);
  assert.equal(saved().stops[0].skipped, true);
  view.unmount();
});

test("excess stops stay editable and repeated visits are confirmed with distinct identities", async () => {
  setup();
  const text = "按顺序游览十二站";
  let mapRequests = 0;
  const output: ItineraryParseResult = {
    ...parsed(text),
    unsupportedNeeds: [],
    placeQueries: Array.from({ length: 12 }, (_, index) => ({
      order: index + 1,
      originalText: `原文地点${index + 1}`,
      queryZh: `地点${index + 1}`,
      note: null,
    })),
  };
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/assist/parse")) return respond(output);
    if (String(url).includes("/places/search")) {
      mapRequests++;
      return respond({ places: [places[0]], hasMore: false });
    }
    return respond(emptyPreview(JSON.parse(String(options?.body))));
  };
  const user = userEvent.setup();
  const view = render(<App />);
  await fill(user, text);
  await screen.findByRole("region", { name: "Draft stop 12" });
  assert.equal(mapRequests, 0);
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Confirm and replace my plan",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  await user.click(
    within(screen.getByRole("region", { name: "Draft stop 12" })).getByRole(
      "button",
      { name: "Remove draft stop" },
    ),
  );
  await user.click(
    within(screen.getByRole("region", { name: "Draft stop 11" })).getByRole(
      "button",
      { name: "Remove draft stop" },
    ),
  );
  await user.click(
    within(screen.getByRole("region", { name: "Draft stop 2" })).getByRole(
      "button",
      { name: "Move draft stop up" },
    ),
  );
  assert.ok(
    within(screen.getByRole("region", { name: "Draft stop 1" })).getByText(
      "原文地点2",
    ),
  );
  await user.type(
    screen.getByRole("textbox", { name: "Notes for stop 1" }),
    "Lunch break",
  );
  await user.click(
    screen.getByRole("button", { name: "Match unresolved places" }),
  );
  for (let index = 1; index <= 10; index++)
    await user.click(
      await within(
        screen.getByRole("region", { name: `Draft stop ${index}` }),
      ).findByRole("button", { name: /Use 植物园入口/ }),
    );
  await user.click(
    screen.getByRole("button", { name: "Confirm and replace my plan" }),
  );
  assert.equal(saved().stops.length, 1);
  await user.click(
    screen.getByRole("button", { name: "Keep repeated visits and confirm" }),
  );
  await waitFor(() => assert.equal(saved().stops.length, 10));
  assert.equal(new Set(saved().stops.map((s) => s.stopId)).size, 10);
  assert.equal(saved().stops[0].note, "Lunch break");
  assert.equal(
    saved().stops.every((s) => s.place.poiId === "garden"),
    true,
  );
  view.unmount();
});

test("a null AI preference uses the choice at confirmation and explicit no-preference remains editable", async () => {
  for (const proposedPreference of [null, "any"] as const) {
    setup();
    const output = {
      ...parsed(),
      proposedPreference,
      placeQueries: [parsed().placeQueries[0]],
      unsupportedNeeds: [],
    };
    globalThis.fetch = async (url, options) =>
      String(url).includes("/assist/parse")
        ? respond(output)
        : String(url).includes("/places/search")
          ? respond({ places: [places[0]], hasMore: false })
          : respond(emptyPreview(JSON.parse(String(options?.body))));
    const user = userEvent.setup();
    const view = render(<App />);
    await fill(user);
    await user.click(
      await screen.findByRole("button", { name: /Use 植物园入口/ }),
    );
    assert.equal(
      (
        screen.getByRole("combobox", {
          name: "Toilet preference to apply",
        }) as HTMLSelectElement
      ).value,
      proposedPreference ?? "keep",
    );
    if (proposedPreference === null)
      await user.click(screen.getByRole("button", { name: "No preference" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm and replace my plan" }),
    );
    await waitFor(() => assert.equal(saved().stops[0].place.poiId, "garden"));
    assert.equal(saved().preference, "any");
    view.unmount();
  }
});

test("unmatched places can be corrected and overlong input remains intact without an AI request", async () => {
  setup();
  let parseRequests = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/assist/parse")) {
      parseRequests++;
      return respond({ ...parsed(), placeQueries: [parsed().placeQueries[0]] });
    }
    if (String(url).includes("/places/search"))
      return respond({
        places: String(url).includes(encodeURIComponent("入口"))
          ? [places[0]]
          : [],
        hasMore: false,
      });
    return respond(emptyPreview(JSON.parse(String(options?.body))));
  };
  const user = userEvent.setup();
  const view = render(<App />);
  fireEvent.change(screen.getByRole("textbox", { name: "Your itinerary" }), {
    target: { value: "字".repeat(2001) },
  });
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Use AI to fill stops",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  assert.equal(
    (
      screen.getByRole("textbox", {
        name: "Your itinerary",
      }) as HTMLTextAreaElement
    ).value.length,
    2001,
  );
  assert.equal(parseRequests, 0);
  fireEvent.change(screen.getByRole("textbox", { name: "Your itinerary" }), {
    target: { value: input },
  });
  await user.click(
    screen.getByRole("button", { name: "Use AI to fill stops" }),
  );
  await screen.findByText(/No matching places/);
  const query = screen.getByRole("textbox", { name: "Search name for stop 1" });
  await user.clear(query);
  await user.type(query, "入口");
  await user.click(screen.getByRole("button", { name: "Search matches" }));
  await user.click(
    await screen.findByRole("button", { name: /Use 植物园入口/ }),
  );
  await user.click(
    screen.getByRole("button", { name: "Confirm and replace my plan" }),
  );
  await waitFor(() => assert.equal(saved().stops[0].place.poiId, "garden"));
  view.unmount();
});

test("editing source text cancels queued place lookups as well as the active requests", async () => {
  setup();
  const pending: ((response: Response) => void)[] = [];
  let calls = 0;
  globalThis.fetch = async (url) =>
    String(url).includes("/assist/parse")
      ? respond({
          ...parsed(),
          placeQueries: Array.from({ length: 4 }, (_, index) => ({
            order: index + 1,
            originalText: `place ${index}`,
            queryZh: `地点${index}`,
            note: null,
          })),
        })
      : new Promise((resolve) => {
          calls++;
          pending.push(resolve);
        });
  const user = userEvent.setup();
  const view = render(<App />);
  await fill(user);
  await waitFor(() => assert.equal(calls, 2));
  await user.type(
    screen.getByRole("textbox", { name: "Your itinerary" }),
    " changed",
  );
  await act(async () => {
    for (const release of pending.splice(0))
      release(respond({ places, hasMore: false }));
  });
  assert.equal(calls, 2);
  assert.equal(screen.queryByRole("button", { name: /Use 植物园入口/ }), null);
  view.unmount();
});

test("the shared place picker never displays an old response under an edited search name", async () => {
  setup();
  let release!: (response: Response) => void;
  globalThis.fetch = async () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const user = userEvent.setup();
  const view = render(
    <PlacePicker
      language="en"
      initialQuery="旧检索"
      allowGeolocation={false}
      onSelect={() => {}}
      onClose={() => {}}
    />,
  );
  const query = screen.getByRole("textbox", { name: "Place name" });
  assert.equal((query as HTMLInputElement).value, "旧检索");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.clear(query);
  await user.type(query, "新检索");
  await act(async () => release(respond({ places, hasMore: false })));
  assert.equal(screen.queryByRole("button", { name: /植物园入口/ }), null);
  assert.equal((query as HTMLInputElement).value, "新检索");
  view.unmount();
});

test("after changed text fails AI parsing the user can explicitly continue with the manually reviewed draft", async () => {
  setup();
  let fail = false;
  let latest = input;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/assist/parse")) {
      latest = JSON.parse(String(options?.body)).text;
      return respond(
        fail
          ? { ...parsed(latest), status: "fallback", placeQueries: [] }
          : {
              ...parsed(latest),
              proposedPreference: "any",
              placeQueries: [parsed().placeQueries[0]],
            },
      );
    }
    if (String(url).includes("/places/search"))
      return respond({ places: [places[0]], hasMore: false });
    return respond(emptyPreview(JSON.parse(String(options?.body))));
  };
  const user = userEvent.setup();
  const view = render(<App />);
  await fill(user);
  await user.click(
    await screen.findByRole("button", { name: /Use 植物园入口/ }),
  );
  fail = true;
  await user.type(
    screen.getByRole("textbox", { name: "Your itinerary" }),
    " Plans changed.",
  );
  await user.click(
    screen.getByRole("button", { name: "Use AI to fill stops" }),
  );
  await screen.findByText(/AI is temporarily unavailable/);
  assert.equal(
    (
      screen.getByRole("button", {
        name: "Confirm and replace my plan",
      }) as HTMLButtonElement
    ).disabled,
    true,
  );
  await user.click(
    screen.getByRole("button", { name: "Use edited draft for this text" }),
  );
  assert.equal(
    (
      screen.getByRole("combobox", {
        name: "Toilet preference to apply",
      }) as HTMLSelectElement
    ).value,
    "keep",
  );
  assert.ok(screen.getByText(/Manually reviewed draft/));
  await user.click(
    screen.getByRole("button", { name: "Confirm and replace my plan" }),
  );
  await waitFor(() => assert.equal(saved().stops[0].place.poiId, "garden"));
  assert.equal(saved().preference, "seated_required");
  view.unmount();
});

test("clearing the plan also clears its unconfirmed draft and rejects a late parse", async () => {
  setup();
  let pending = false;
  let release!: (response: Response) => void;
  globalThis.fetch = async (url) =>
    String(url).includes("/assist/parse")
      ? pending
        ? new Promise((resolve) => {
            release = resolve;
          })
        : respond(parsed())
      : respond({ places, hasMore: false });
  const user = userEvent.setup();
  const view = render(<App />);
  await fill(user);
  await screen.findByRole("region", { name: "Draft stop 1" });
  pending = true;
  await user.click(
    screen.getByRole("button", { name: "Use AI to fill stops" }),
  );
  await user.click(screen.getByRole("button", { name: "Clear plan" }));
  await user.click(screen.getByRole("button", { name: "Confirm clear" }));
  await act(async () => release(respond(parsed())));
  assert.equal(!!screen.queryByRole("region", { name: "Draft stop 1" }), false);
  assert.equal(
    (
      screen.getByRole("textbox", {
        name: "Your itinerary",
      }) as HTMLTextAreaElement
    ).value,
    "",
  );
  assert.deepEqual(saved().stops, []);
  view.unmount();
});

test("recorded real AI and map responses retain their candidate identities and explanations in the rendered plan", async () => {
  setup();
  const recorded = JSON.parse(
    await readFile(
      new URL("../fixtures/recorded-ai-itinerary.json", import.meta.url),
      "utf8",
    ),
  ) as {
    input: string;
    parse: ItineraryParseResult;
    stations: {
      place: Place;
      analysisStatus: SearchResult["analysisStatus"];
      primaryId: string;
      cards: { group: keyof CandidateGroups; candidate: Candidate }[];
    }[];
  };
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/assist/parse")) return respond(recorded.parse);
    if (String(url).includes("/places/search")) {
      const query = new URL(
        String(url),
        "http://offline.invalid",
      ).searchParams.get("q");
      const index = recorded.parse.placeQueries.findIndex(
        (place) => place.queryZh === query,
      );
      return respond({
        places: [recorded.stations[index].place],
        hasMore: false,
      });
    }
    const request = JSON.parse(String(options?.body)) as PlanPreviewRequest;
    return respond({
      revision: request.revision,
      status: "complete",
      stops: request.stops.map((stop) => {
        const station = recorded.stations.find(
          (item) => item.place.poiId === stop.place.poiId,
        )!;
        const groups: CandidateGroups = {
          matched: [],
          farther: [],
          otherNearby: [],
          conditionalAccess: [],
          routeUnknown: [],
        };
        for (const card of station.cards)
          groups[card.group].push(card.candidate);
        return {
          stopId: stop.stopId,
          error: null,
          warnings: [],
          primary: groups.matched[0] ?? null,
          alternatives: station.cards
            .filter((card) => card.candidate.toiletId !== station.primaryId)
            .map((card) => card.candidate),
          result: {
            status: "complete",
            queryVersion: request.revision,
            origin: {
              ...stop.place.position,
              label: stop.place.nameZh,
              source: "place",
            },
            groups,
            analysisStatus: station.analysisStatus,
            summary: "",
            pendingWork: false,
            hasMore: false,
            nextCursor: null,
            batchCursor: "recorded-excerpt",
          },
        };
      }),
    });
  };
  const user = userEvent.setup();
  const view = render(<App />);
  await fill(user, recorded.input);
  for (let index = 0; index < recorded.stations.length; index++) {
    const row = await screen.findByRole("region", {
      name: `Draft stop ${index + 1}`,
    });
    await user.click(
      await within(row).findByRole("button", {
        name: new RegExp(`^Use ${recorded.stations[index].place.nameZh}`),
      }),
    );
  }
  await user.click(
    screen.getByRole("button", { name: "Confirm and replace my plan" }),
  );
  for (let index = 0; index < recorded.stations.length; index++) {
    const station = recorded.stations[index];
    const primary = station.cards.find(
      (card) => card.candidate.toiletId === station.primaryId,
    )!.candidate;
    const row = await screen.findByRole("region", {
      name: `Stop ${index + 1}`,
    });
    const card = await within(row).findByRole("group", {
      name: primary.nameZh,
    });
    assert.equal(
      within(card).getByRole("article").getAttribute("data-toilet-id"),
      primary.toiletId,
    );
    assert.equal(card.textContent?.includes(primary.reason), true);
    assert.equal(card.textContent?.includes(primary.sources[0].name), true);
  }
  assert.deepEqual(
    saved().stops.map((stop) => stop.place.poiId),
    recorded.stations.map((station) => station.place.poiId),
  );
  view.unmount();
});

test("long source context survives draft confirmation and refresh as a collapsed contextual note", async () => {
  setup();
  const source = "Morning garden, then a gallery visit. ".padEnd(2000, "x");
  globalThis.fetch = async (url, options) =>
    String(url).includes("/assist/parse")
      ? respond({
          ...parsed(source),
          placeQueries: [
            {
              ...parsed().placeQueries[0],
              note: source,
              noteKind: "source_context",
            },
          ],
        })
      : String(url).includes("/places/search")
        ? respond({ places: [places[0]], hasMore: false })
        : respond(emptyPreview(JSON.parse(String(options?.body))));
  const user = userEvent.setup();
  let view = render(<App />);
  fireEvent.change(screen.getByRole("textbox", { name: "Your itinerary" }), {
    target: { value: source },
  });
  await user.click(
    screen.getByRole("button", { name: "Use AI to fill stops" }),
  );
  const note = await screen.findByRole("textbox", { name: "Notes for stop 1" });
  assert.equal(note.tagName, "TEXTAREA");
  assert.equal((note as HTMLTextAreaElement).maxLength, 2000);
  assert.equal((note as HTMLTextAreaElement).value, source);
  await user.click(
    await screen.findByRole("button", { name: /Use 植物园入口/ }),
  );
  await user.click(
    screen.getByRole("button", { name: "Confirm and replace my plan" }),
  );
  await waitFor(() =>
    assert.equal(saved().stops[0].noteKind, "source_context"),
  );
  assert.equal(saved().stops[0].note, source);
  let summary = screen.getByText(
    "Original context may cover multiple stops. Please check.",
  );
  assert.equal((summary.closest("details") as HTMLDetailsElement).open, false);
  await user.click(summary);
  assert.equal((summary.closest("details") as HTMLDetailsElement).open, true);
  assert.equal(summary.closest("details")!.textContent?.includes(source), true);
  view.unmount();
  view = render(<App />);
  summary = screen.getByText(
    "Original context may cover multiple stops. Please check.",
  );
  assert.equal((summary.closest("details") as HTMLDetailsElement).open, false);
  assert.equal(saved().stops[0].noteKind, "source_context");
  await user.click(screen.getByRole("button", { name: "Edit stops" }));
  assert.ok(
    screen.getByText(
      "Original context may cover multiple stops. Please check.",
    ),
  );
  await user.click(screen.getByRole("button", { name: "Replace stop 1" }));
  await user.type(screen.getByRole("textbox", { name: "Place name" }), "入口");
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByRole("button", { name: /植物园入口/ }));
  assert.equal(saved().stops[0].noteKind, "source_context");
  await user.click(screen.getByRole("button", { name: "中文" }));
  assert.ok(screen.getByText("原文上下文，可能包含多站，请核对"));
  assert.equal(saved().stops[0].note, source);
  view.unmount();
});

test("editing a contextual draft note makes it an ordinary stop note without persisting the original textbox", async () => {
  setup();
  const source = "garden itinerary context ".repeat(30);
  globalThis.fetch = async (url, options) =>
    String(url).includes("/assist/parse")
      ? respond({
          ...parsed(source),
          placeQueries: [
            {
              ...parsed().placeQueries[0],
              note: source,
              noteKind: "source_context",
            },
          ],
        })
      : String(url).includes("/places/search")
        ? respond({ places: [places[0]], hasMore: false })
        : respond(emptyPreview(JSON.parse(String(options?.body))));
  const user = userEvent.setup();
  const view = render(<App />);
  fireEvent.change(screen.getByRole("textbox", { name: "Your itinerary" }), {
    target: { value: source },
  });
  await user.click(
    screen.getByRole("button", { name: "Use AI to fill stops" }),
  );
  const note = await screen.findByRole("textbox", { name: "Notes for stop 1" });
  assert.ok(
    screen.getByText(
      "Original context may cover multiple stops. Please check.",
    ),
  );
  fireEvent.change(note, {
    target: { value: "Meet at this entrance after lunch." },
  });
  assert.equal(
    !!screen.queryByText(
      "Original context may cover multiple stops. Please check.",
    ),
    false,
  );
  await user.click(
    await screen.findByRole("button", { name: /Use 植物园入口/ }),
  );
  await user.click(
    screen.getByRole("button", { name: "Confirm and replace my plan" }),
  );
  await waitFor(() =>
    assert.equal(saved().stops[0].note, "Meet at this entrance after lunch."),
  );
  assert.equal(saved().stops[0].noteKind, undefined);
  assert.equal(localStorage.getItem("readytogo-plan")!.includes(source), false);
  const resultNote = screen.getByText("Meet at this entrance after lunch.");
  assert.equal(Boolean(resultNote.closest("details")), false);
  view.unmount();
});

test("schema version one archives without noteKind keep their ordinary notes", async () => {
  setup();
  const previous = saved();
  previous.stops[0].note = "Meet outside the main gate.";
  localStorage.setItem("readytogo-plan", JSON.stringify(previous));
  const user = userEvent.setup();
  let view = render(<App />);
  assert.equal(
    Boolean(screen.getByText("Meet outside the main gate.").closest("details")),
    false,
  );
  assert.equal(!!screen.queryByText(/could not be restored/), false);
  await user.click(screen.getByRole("button", { name: "No preference" }));
  assert.equal(saved().stops[0].note, "Meet outside the main gate.");
  assert.equal(saved().stops[0].noteKind, undefined);
  view.unmount();
  view = render(<App />);
  assert.ok(screen.getByText("Meet outside the main gate."));
  assert.equal(saved().schemaVersion, 1);
  view.unmount();
});
