import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import type {
  Candidate,
  Place,
  PlanLocal,
  PlanPreviewRequest,
  SearchResult,
} from "../../src/shared/contracts.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://isolated-plan.invalid/plan",
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
const { render, screen, waitFor, cleanup, act, within } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: App } = await import("../../src/client/App.js");
const place: Place = {
  provider: "amap",
  poiId: "visit-a",
  nameZh: "园区入口",
  nameEn: null,
  addressZh: "园路1号",
  district: "东城区",
  city: "北京市",
  position: { lng: 116.4, lat: 39.9, crs: "GCJ02" },
  originType: "poi",
};
function respond(data: unknown) {
  return new Response(
    JSON.stringify({ requestId: "offline", data, warnings: [] }),
    { headers: { "content-type": "application/json" } },
  );
}
function saved(): PlanLocal {
  return JSON.parse(localStorage.getItem("readytogo-plan")!);
}
function setup() {
  cleanup();
  localStorage.clear();
  history.replaceState(null, "", "/plan");
}
function seed(stops: PlanLocal["stops"] = [{ stopId: "first", place }]) {
  localStorage.setItem(
    "readytogo-plan",
    JSON.stringify({
      schemaVersion: 1,
      language: "en",
      preference: "any",
      includeConditionalAccess: false,
      walkLimitMinutes: 10,
      extendedRadiusKm: 5,
      revision: 1,
      stops,
      updatedAt: "2026-10-09T00:00:00Z",
    }),
  );
  history.replaceState(null, "", "/plan/result");
}
function candidate(id: string): Candidate {
  return {
    toiletId: id,
    nameZh: id,
    nameEn: null,
    addressZh: "园路",
    district: "东城区",
    position: place.position,
    seatStatus: "inferred",
    seatBasis: ["thirdRestroom"],
    facilities: {
      maleStalls: null,
      femaleStalls: null,
      unisexStalls: null,
      thirdRestroom: 1,
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
    openingStatus: "unknown",
    openingHoursRaw: null,
    accessCondition: "public",
    accessNote: null,
    routeStatus: "success",
    walkSeconds: 180,
    walkMeters: 200,
    straightLineMeters: 160,
    reason: "Facility records suggest a seated toilet.",
    sources: [],
  };
}
function preview(
  request: PlanPreviewRequest,
  items: Candidate[],
  pending = false,
) {
  const result: SearchResult = {
    status: pending ? "partial" : "complete",
    queryVersion: request.revision,
    origin: { ...place.position, label: place.nameZh, source: "place" },
    groups: {
      matched: items,
      farther: [],
      otherNearby: [],
      conditionalAccess: [],
      routeUnknown: [],
    },
    analysisStatus: pending ? "pending" : "complete",
    summary: "",
    pendingWork: pending,
    hasMore: false,
    nextCursor: null,
    batchCursor: "current-batch",
  };
  return {
    revision: request.revision,
    status: pending ? "partial" : "complete",
    stops: request.stops.map((s) => ({
      stopId: s.stopId,
      result,
      primary: items[0] ?? null,
      alternatives: items.slice(1, 3),
      error: null,
      warnings: [],
    })),
  };
}

test("manual planning confirms duplicate visits and restores stable stops after refresh", async () => {
  setup();
  globalThis.fetch = async () => respond({ places: [place], hasMore: false });
  const user = userEvent.setup();
  let view = render(<App />);
  async function add() {
    await user.click(screen.getByRole("button", { name: "Add a stop" }));
    await user.type(
      screen.getByRole("textbox", { name: "Place name" }),
      "园区",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /园区入口/ }));
  }
  await add();
  await waitFor(() => assert.equal(saved().stops.length, 1));
  const first = saved().stops[0].stopId;
  await add();
  assert.equal(saved().stops.length, 1);
  await user.click(screen.getByRole("button", { name: "Add again" }));
  await waitFor(() => assert.equal(saved().stops.length, 2));
  assert.notEqual(saved().stops[1].stopId, first);
  const second = saved().stops[1].stopId;
  await user.click(screen.getAllByRole("button", { name: "Move up" })[1]);
  await waitFor(() =>
    assert.deepEqual(
      saved().stops.map((s) => s.stopId),
      [second, first],
    ),
  );
  view.unmount();
  view = render(<App />);
  assert.equal(
    screen.getAllByRole("button", { name: /Replace stop/ }).length,
    2,
  );
  assert.deepEqual(
    saved().stops.map((s) => s.stopId),
    [second, first],
  );
  view.unmount();
});

test("late analysis does not overwrite an explicit toilet choice or a skipped stop", async () => {
  setup();
  seed();
  const replies: {
    request: PlanPreviewRequest;
    resolve: (response: Response) => void;
  }[] = [];
  globalThis.fetch = async (_input, options) => {
    const request = JSON.parse(String(options?.body)) as PlanPreviewRequest;
    return request.revision === 1
      ? respond(
          preview(request, [candidate("厕所甲"), candidate("厕所乙")], true),
        )
      : new Promise((resolve) => replies.push({ request, resolve }));
  };
  const user = userEvent.setup();
  const view = render(<App />);
  const choice = await screen.findByRole("group", { name: "厕所乙" });
  await user.click(
    within(choice).getByRole("button", { name: "Choose this toilet" }),
  );
  await waitFor(() =>
    assert.equal(saved().stops[0].selectedToiletId, "厕所乙"),
  );
  await user.click(
    screen.getByRole("button", { name: "Skip toilet arrangement" }),
  );
  await waitFor(() => assert.equal(saved().stops[0].skipped, true));
  await act(async () => {
    for (const reply of replies)
      reply.resolve(respond(preview(reply.request, [candidate("新推荐")])));
  });
  assert.equal(saved().stops[0].selectedToiletId, "厕所乙");
  assert.equal(saved().stops[0].skipped, true);
  assert.ok(screen.getByText(/Toilet arrangement skipped/));
  view.unmount();
});

test("access and range settings follow the user between planning and nearby pages", async () => {
  setup();
  const user = userEvent.setup();
  const view = render(<App />);
  await user.click(
    screen.getByRole("checkbox", { name: "Include ticket or purchase access" }),
  );
  await user.click(screen.getByRole("button", { name: "20 min" }));
  await user.click(screen.getByRole("button", { name: "Find nearby" }));
  assert.equal(
    (
      screen.getByRole("checkbox", {
        name: "Include ticket or purchase access",
      }) as HTMLInputElement
    ).checked,
    true,
  );
  assert.equal(
    screen.getByRole("button", { name: "20 min" }).getAttribute("aria-pressed"),
    "true",
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Include ticket or purchase access" }),
  );
  await user.click(screen.getByRole("button", { name: "Plan stops" }));
  assert.equal(
    (
      screen.getByRole("checkbox", {
        name: "Include ticket or purchase access",
      }) as HTMLInputElement
    ).checked,
    false,
  );
  view.unmount();
});

test("adding repeated stops keeps distinct stable IDs on HTTP browsers without randomUUID", async () => {
  setup();
  globalThis.fetch = async () => respond({ places: [place], hasMore: false });
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues: (bytes: Uint8Array) => {
        for (let i = 0; i < bytes.length; i++) bytes[i] = i + 1;
        return bytes;
      },
    },
  });
  const view = render(<App />);
  const user = userEvent.setup();
  try {
    await user.click(screen.getByRole("button", { name: "Add a stop" }));
    await user.type(
      screen.getByRole("textbox", { name: "Place name" }),
      "园路",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /园区入口/ }));
    await waitFor(() => assert.equal(saved().stops.length, 1));
    const first = saved().stops[0].stopId;
    await user.click(screen.getByRole("button", { name: "Add a stop" }));
    await user.type(
      screen.getByRole("textbox", { name: "Place name" }),
      "园路",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /园区入口/ }));
    await user.click(screen.getByRole("button", { name: "Add again" }));
    await waitFor(() => assert.equal(saved().stops.length, 2));
    assert.equal(saved().stops[0].stopId, first);
    assert.notEqual(saved().stops[1].stopId, first);
  } finally {
    view.unmount();
    if (original) Object.defineProperty(globalThis, "crypto", original);
  }
});

test("unknown storage versions and unavailable storage leave a usable editor", async () => {
  setup();
  localStorage.setItem(
    "readytogo-plan",
    JSON.stringify({ schemaVersion: 99, stops: [] }),
  );
  let view = render(<App />);
  assert.ok(screen.getByText(/saved plan uses another version/i));
  assert.ok(screen.getByRole("button", { name: "Add a stop" }));
  view.unmount();
  setup();
  const original = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = () => {
    throw new Error("storage unavailable");
  };
  try {
    view = render(<App />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Seated toilet needed" }));
    assert.ok(await screen.findByText(/Changes will last for this visit only/));
    assert.equal(
      screen
        .getByRole("button", { name: "Seated toilet needed" })
        .getAttribute("aria-pressed"),
      "true",
    );
  } finally {
    view.unmount();
    dom.window.Storage.prototype.setItem = original;
  }
});

test("canonical identities preserve the same chosen toilet at two stops while changed conditions await later pages", async () => {
  setup();
  seed([
    { stopId: "first", place, selectedToiletId: "amap_poi-a" },
    { stopId: "second", place, selectedToiletId: "amap_poi-a" },
  ]);
  const canonical = {
    ...candidate("local-a"),
    nameZh: "资料公厕",
    sources: [
      {
        provider: "amap" as const,
        name: "Amap",
        poiId: "poi-a",
        rawFields: {},
      },
    ],
  };
  globalThis.fetch = async (_input, options) => {
    const request = JSON.parse(String(options?.body)) as PlanPreviewRequest;
    if (request.preference === "seated_required" && !request.stops[0].cursor) {
      const data = preview(request, []);
      data.stops[0].result.hasMore = true;
      data.stops[0].result.nextCursor = "later-page";
      return respond(data);
    }
    return respond(preview(request, [canonical]));
  };
  const user = userEvent.setup();
  const view = render(<App />);
  await waitFor(() =>
    assert.deepEqual(
      saved().stops.map((s) => s.selectedToiletId),
      ["local-a", "local-a"],
    ),
  );
  assert.equal(screen.getAllByRole("group", { name: "资料公厕" }).length, 2);
  await user.click(
    screen.getByRole("button", { name: "Seated toilet needed" }),
  );
  await waitFor(() =>
    assert.equal(screen.getAllByText(/awaiting a check/).length, 2),
  );
  assert.equal(screen.queryAllByRole("group", { name: "资料公厕" }).length, 0);
  assert.deepEqual(
    saved().stops.map((s) => s.selectedToiletId),
    ["local-a", "local-a"],
  );
  await user.click(
    screen.getAllByRole("button", { name: "Load more candidates" })[0],
  );
  assert.ok(await screen.findByRole("group", { name: "资料公厕" }));
  assert.deepEqual(
    saved().stops.map((s) => s.selectedToiletId),
    ["local-a", "local-a"],
  );
  view.unmount();
});

test("clearing a plan removes choices and prevents late previews from restoring its stops", async () => {
  setup();
  seed([
    { stopId: "first", place, selectedToiletId: "chosen", skipped: false },
  ]);
  let reply:
    | { request: PlanPreviewRequest; resolve: (response: Response) => void }
    | undefined;
  globalThis.fetch = async (_input, options) =>
    new Promise((resolve) => {
      reply = { request: JSON.parse(String(options?.body)), resolve };
    });
  const user = userEvent.setup();
  const view = render(<App />);
  await waitFor(() => assert.ok(reply));
  await user.click(screen.getByRole("button", { name: "Edit stops" }));
  await user.click(screen.getByRole("button", { name: "Clear plan" }));
  await user.click(screen.getByRole("button", { name: "Confirm clear" }));
  await act(async () =>
    reply!.resolve(respond(preview(reply!.request, [candidate("chosen")]))),
  );
  assert.deepEqual(saved().stops, []);
  assert.equal(
    screen.queryAllByRole("button", { name: /Replace stop/ }).length,
    0,
  );
  await user.click(screen.getByRole("button", { name: "中文" }));
  assert.equal(saved().language, "zh-CN");
  view.unmount();
  const restored = render(<App />);
  assert.equal(screen.queryAllByRole("button", { name: /更换景点/ }).length, 0);
  restored.unmount();
});

test("reordering during preview uses stable stop identities and accepts only the new revision", async () => {
  setup();
  seed([
    { stopId: "first", place },
    {
      stopId: "second",
      place: {
        ...place,
        poiId: "visit-b",
        nameZh: "第二站",
        position: { ...place.position, lng: 116.405 },
      },
    },
  ]);
  const replies: {
    request: PlanPreviewRequest;
    resolve: (response: Response) => void;
  }[] = [];
  globalThis.fetch = async (_input, options) => {
    const request = JSON.parse(String(options?.body)) as PlanPreviewRequest;
    return request.revision === 1
      ? new Promise((resolve) => replies.push({ request, resolve }))
      : respond(preview(request, [candidate(request.stops[0].stopId)]));
  };
  const user = userEvent.setup();
  const view = render(<App />);
  await waitFor(() => assert.equal(replies.length, 2));
  await user.click(screen.getByRole("button", { name: "Edit stops" }));
  await user.click(screen.getAllByRole("button", { name: "Move up" })[1]);
  await user.click(
    screen.getByRole("button", { name: "Find toilets for my stops" }),
  );
  await waitFor(() =>
    assert.ok(
      within(screen.getByRole("region", { name: "Stop 1" })).getByRole(
        "group",
        { name: "second" },
      ),
    ),
  );
  await act(async () => {
    for (const reply of replies)
      reply.resolve(respond(preview(reply.request, [candidate("stale")])));
  });
  assert.equal(screen.queryAllByRole("group", { name: "stale" }).length, 0);
  assert.deepEqual(
    saved().stops.map((s) => s.stopId),
    ["second", "first"],
  );
  view.unmount();
});

test("replacing a stop refreshes only that origin and single-stop retry preserves another successful result", async () => {
  setup();
  seed([
    { stopId: "first", place },
    {
      stopId: "second",
      place: { ...place, poiId: "visit-b", nameZh: "第二站" },
    },
  ]);
  const requests: PlanPreviewRequest[] = [];
  let failed = true;
  globalThis.fetch = async (input, options) => {
    if (String(input).includes("/places/search"))
      return respond({
        places: [
          {
            ...place,
            poiId: "replacement",
            nameZh: "新入口",
            position: { ...place.position, lng: 116.42 },
          },
        ],
        hasMore: false,
      });
    const request = JSON.parse(String(options?.body)) as PlanPreviewRequest;
    requests.push(request);
    if (request.stops[0].stopId === "first" && failed)
      return respond({
        revision: request.revision,
        status: "partial",
        stops: [
          {
            stopId: "first",
            result: null,
            primary: null,
            alternatives: [],
            warnings: [],
            error: {
              code: "UPSTREAM",
              message: "Unavailable",
              retryable: true,
            },
          },
        ],
      });
    return respond(preview(request, [candidate(request.stops[0].stopId)]));
  };
  const user = userEvent.setup();
  const view = render(<App />);
  assert.ok(await screen.findByRole("group", { name: "second" }));
  await screen.findByRole("button", { name: "Retry this stop" });
  failed = false;
  await user.click(screen.getByRole("button", { name: "Retry this stop" }));
  assert.ok(await screen.findByRole("group", { name: "first" }));
  assert.equal(
    requests.filter((r) => r.stops[0].stopId === "second").length,
    1,
  );
  await user.click(screen.getByRole("button", { name: "Edit stops" }));
  await user.click(screen.getByRole("button", { name: "Replace stop 1" }));
  await user.type(
    screen.getByRole("textbox", { name: "Place name" }),
    "新入口",
  );
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.click(await screen.findByRole("button", { name: /新入口/ }));
  await waitFor(() =>
    assert.equal(requests.at(-1)?.stops[0].place.position.lng, 116.42),
  );
  assert.equal(
    requests.filter((r) => r.stops[0].stopId === "second").length,
    1,
  );
  assert.equal(saved().stops[0].stopId, "first");
  view.unmount();
});

test("current GPS remains session-only when planning preferences are saved", async () => {
  setup();
  seed();
  const secure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
  const geo = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: (value: unknown) => void) =>
        success({
          coords: { longitude: 116.451234, latitude: 39.951234, accuracy: 20 },
          timestamp: 0,
        }),
    },
  });
  globalThis.fetch = async (input, options) =>
    String(input).includes("/location/convert")
      ? respond({
          lng: 116.451234,
          lat: 39.951234,
          crs: "GCJ02",
          source: "geolocation",
          label: "Current GPS",
          accuracyMeters: 20,
        })
      : respond(
          preview(JSON.parse(String(options?.body)), [candidate("厕所")]),
        );
  const user = userEvent.setup();
  const view = render(<App />);
  try {
    await user.click(
      await screen.findByRole("button", {
        name: "Find from my current location",
      }),
    );
    await screen.findByText("Current GPS");
    await user.click(screen.getByRole("button", { name: "20 min" }));
    const raw = localStorage.getItem("readytogo-plan")!;
    assert.equal(raw.includes("116.451234"), false);
    assert.equal(raw.includes("geolocation"), false);
    assert.equal(saved().stops[0].place.originType, "poi");
  } finally {
    view.unmount();
    if (secure) Object.defineProperty(window, "isSecureContext", secure);
    else Reflect.deleteProperty(window, "isSecureContext");
    if (geo) Object.defineProperty(navigator, "geolocation", geo);
    else Reflect.deleteProperty(navigator, "geolocation");
  }
});
