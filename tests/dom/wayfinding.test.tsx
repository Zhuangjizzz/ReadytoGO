import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React from "react";
import type { Candidate, SearchRequest } from "../../src/shared/contracts.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://isolated-app-component.invalid/",
});
for (const [key, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  localStorage: dom.window.localStorage,
  getComputedStyle: dom.window.getComputedStyle,
  history: dom.window.history,
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
const { DetailPage } = await import("../../src/client/DetailPage.js");
const origin = {
  lng: 116.4,
  lat: 39.9,
  crs: "GCJ02",
  label: "示例入口",
  source: "place",
} as const;
const candidate: Candidate = {
  toiletId: "garden",
  nameZh: "公园厕所",
  nameEn: null,
  addressZh: "园路",
  district: "东城区",
  position: { lng: 116.401, lat: 39.901, crs: "GCJ02" },
  seatStatus: "unknown",
  seatBasis: [],
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
  },
  openingStatus: "unknown",
  openingHoursRaw: null,
  accessCondition: "unknown",
  accessNote: null,
  routeStatus: "success",
  walkSeconds: 180,
  walkMeters: 300,
  straightLineMeters: 140,
  reason: "Source-backed route description",
  sources: [],
};
function respond(data: unknown) {
  return new Response(
    JSON.stringify({ requestId: "offline", data, warnings: [] }),
    { headers: { "content-type": "application/json" } },
  );
}
function requestStub(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = String(input);
  if (url.includes("/places/search"))
    return Promise.resolve(
      respond({
        places: [
          {
            provider: "amap",
            poiId: "entrance",
            nameZh: origin.label,
            nameEn: null,
            addressZh: "园路西门",
            district: "东城区",
            city: "北京市",
            position: origin,
            originType: "poi",
          },
        ],
        hasMore: false,
      }),
    );
  if (url.includes("/toilets/search")) {
    const request = JSON.parse(String(init?.body)) as SearchRequest;
    return Promise.resolve(
      respond({
        status: "complete",
        queryVersion: request.queryVersion,
        origin: request.origin,
        groups: {
          matched: [candidate],
          farther: [],
          otherNearby: [],
          conditionalAccess: [],
          routeUnknown: [],
        },
        analysisStatus: "fallback",
        summary: "Available options",
        pendingWork: false,
        hasMore: false,
        nextCursor: null,
      }),
    );
  }
  if (url.includes("/toilets/garden"))
    return Promise.resolve(
      respond({
        ...candidate,
        id: candidate.toiletId,
        sourcePosition: null,
        positionSource: "amap",
        poiId: "garden",
        matchMethod: null,
        availability: "unknown",
      }),
    );
  if (url.includes("/navigation/link"))
    return Promise.resolve(
      respond({
        origin,
        destination: candidate.position,
        appUrl: "https://uri.amap.com/navigation?callnative=1",
        webUrl: "https://uri.amap.com/navigation?callnative=0",
        searchUrl: "https://uri.amap.com/search?keyword=公园厕所",
        copyText: "公园厕所\n园路",
        routeStatus: "success",
        walkSeconds: 180,
        walkMeters: 300,
      }),
    );
  throw new Error(`Unexpected request ${url}`);
}

test("offline app composition: home, manual nearby search, details, navigation and bilingual phrases remain connected", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = requestStub;
  dom.window.history.replaceState(null, "", "/");
  dom.window.localStorage.clear();
  try {
    render(<App />);
    const user = userEvent.setup({ document: dom.window.document });
    await user.click(
      screen.getByRole("button", { name: /Find a toilet.*Use your location/ }),
    );
    assert.equal(dom.window.location.pathname, "/nearby");
    await user.click(
      screen.getByRole("button", { name: /Choose a Beijing place/ }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Place name" }),
      "入口",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /示例入口/ }));
    await user.click(
      screen.getAllByRole("button", { name: "Find a toilet" })[0],
    );
    await user.click(await screen.findByRole("button", { name: "Details" }));
    assert.equal(dom.window.location.pathname, "/toilets/garden");
    await screen.findByRole("heading", { name: "公园厕所" });
    await screen.findByRole("link", { name: /Open web route/ });
    const visibleDetail = within(screen.getByRole("main"));
    assert.ok(visibleDetail.getByText(candidate.reason));
    await user.click(screen.getByRole("button", { name: "中文" }));
    assert.equal(visibleDetail.queryByText(candidate.reason), null);
    assert.ok(visibleDetail.getByText("根据地址、路线和已有设施资料选择。"));
    await user.click(screen.getByRole("button", { name: "English" }));
    assert.ok(visibleDetail.getByText(candidate.reason));
    await user.click(screen.getByRole("button", { name: /Back to results/ }));
    assert.equal(dom.window.location.pathname, "/nearby");
    assert.equal(
      screen.getByRole("button", { name: /示例入口/ }) !== null,
      true,
    );
    await user.click(screen.getByRole("button", { name: "Navigate" }));
    await screen.findByRole("link", { name: /Open Amap app/ });
    await user.click(screen.getByRole("button", { name: "Close navigation" }));
    await user.click(screen.getByRole("button", { name: "Phrase cards" }));
    assert.equal(dom.window.location.pathname, "/phrases");
    await user.click(
      screen.getByRole("button", { name: /请问厕所现在开放吗/ }),
    );
    await screen.findByRole("heading", {
      name: "请问厕所现在开放吗？",
    });
    await user.click(screen.getByRole("button", { name: "中文" }));
    assert.equal(dom.window.document.documentElement.lang, "zh-CN");
    assert.ok(screen.getByRole("button", { name: /上一句/ }));
    await user.click(screen.getByRole("button", { name: /全部询问卡/ }));
    await user.click(screen.getByRole("button", { name: /^← 返回$/ }));
    await screen.findByRole("button", { name: "查看详情" });
    assert.equal(dom.window.location.pathname, "/nearby");
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("offline app composition: a late GPS conversion cannot overwrite a manually selected origin", async () => {
  const originalFetch = globalThis.fetch;
  let release: ((r: Response) => void) | undefined;
  globalThis.fetch = (input, init) =>
    String(input).includes("/location/convert")
      ? new Promise((resolve) => {
          release = resolve;
        })
      : requestStub(input, init);
  Object.defineProperty(dom.window, "isSecureContext", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(dom.window.navigator, "geolocation", {
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({
          coords: {
            longitude: 116.41,
            latitude: 39.91,
            accuracy: 20,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: 0,
          toJSON: () => ({}),
        }),
    },
    configurable: true,
  });
  dom.window.history.replaceState(null, "", "/");
  dom.window.localStorage.clear();
  try {
    render(<App />);
    const user = userEvent.setup({ document: dom.window.document });
    await user.click(
      screen.getByRole("button", { name: /Find a toilet.*Use your location/ }),
    );
    await waitFor(() => assert.ok(release));
    await user.click(
      screen.getByRole("button", { name: /Choose a Beijing place/ }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Place name" }),
      "入口",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByRole("button", { name: /示例入口/ }));
    await act(async () => {
      release!(
        respond({
          lng: 116.42,
          lat: 39.92,
          crs: "GCJ02",
          source: "geolocation",
          label: "Late GPS location",
          accuracyMeters: 20,
        }),
      );
    });
    assert.ok(screen.getByRole("button", { name: /示例入口/ }));
    assert.equal(
      screen.queryByRole("button", { name: /Late GPS location/ }),
      null,
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("offline detail: source refresh retains the validated candidate analysis and language changes never reuse its old explanation", async () => {
  const originalFetch = globalThis.fetch;
  const analyzed: Candidate = {
    ...candidate,
    nameEn: "Garden comfort stop",
    seatStatus: "inferred",
    seatBasis: ["The source describes an accessible room."],
    reason:
      "An accessible room in the source suggests a seated toilet may be available.",
  };
  globalThis.fetch = (input, init) =>
    String(input).includes("/toilets/garden")
      ? Promise.resolve(
          respond({
            ...candidate,
            id: "garden",
            nameEn: null,
            seatStatus: "unknown",
            addressZh: "源资料地址",
            facilities: { ...candidate.facilities, femaleStalls: 4 },
            sources: [{ provider: "amap", name: "来源名称", rawFields: {} }],
          }),
        )
      : requestStub(input, init);
  try {
    const { rerender } = render(
      <DetailPage
        toiletId="garden"
        candidate={analyzed}
        candidateLanguage="en"
        origin={origin}
        language="en"
        onBack={() => {}}
      />,
    );
    await screen.findByText("源资料地址", { exact: false });
    assert.ok(screen.getByRole("heading", { name: "Garden comfort stop" }));
    assert.ok(screen.getByText("May have a seated toilet"));
    assert.ok(screen.getByText(analyzed.reason));
    assert.ok(screen.getByText("Female stalls: 4"));
    rerender(
      <DetailPage
        toiletId="garden"
        candidate={analyzed}
        candidateLanguage="en"
        origin={origin}
        language="zh-CN"
        onBack={() => {}}
      />,
    );
    assert.equal(screen.queryByText(analyzed.reason), null);
    assert.equal(screen.queryByText(analyzed.seatBasis[0]), null);
    assert.ok(screen.getByText("可能有坐便"));
    assert.ok(screen.getByText("设施资料中有坐便线索，供选择时参考。"));
    await screen.findByText("源资料地址", { exact: false });
    rerender(
      <DetailPage
        toiletId="garden"
        candidate={analyzed}
        candidateLanguage="en"
        origin={origin}
        language="en"
        onBack={() => {}}
      />,
    );
    await screen.findByText("源资料地址", { exact: false });
    assert.ok(screen.getByRole("heading", { name: "Garden comfort stop" }));
    assert.ok(screen.getByText(analyzed.reason));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("offline detail: explicit source unavailability supersedes a prior inferred candidate", async () => {
  const originalFetch = globalThis.fetch;
  const analyzed: Candidate = {
    ...candidate,
    seatStatus: "inferred",
    reason: "A seated toilet may be available.",
  };
  globalThis.fetch = (input, init) =>
    String(input).includes("/toilets/garden")
      ? Promise.resolve(
          respond({
            ...candidate,
            id: "garden",
            seatStatus: "unavailable",
            seatBasis: ["无成人坐便"],
            facilities: { ...candidate.facilities, adultSeated: false },
          }),
        )
      : requestStub(input, init);
  try {
    render(
      <DetailPage
        toiletId="garden"
        candidate={analyzed}
        candidateLanguage="en"
        origin={origin}
        language="en"
        onBack={() => {}}
      />,
    );
    await screen.findByText("Adult seated toilet unavailable");
    assert.equal(screen.queryByText(analyzed.reason), null);
    assert.ok(
      screen.getByText(
        "The source indicates an adult seated toilet is unavailable.",
      ),
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("offline detail: a requested alias accepts canonical source details while retaining its query analysis", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) =>
    String(input).includes("/toilets/garden")
      ? Promise.resolve(
          respond({
            ...candidate,
            id: "canonical-garden",
            nameZh: "规范来源名称",
            addressZh: "规范来源地址",
          }),
        )
      : requestStub(input, init);
  try {
    render(
      <DetailPage
        toiletId="garden"
        candidate={candidate}
        candidateLanguage="en"
        origin={origin}
        language="en"
        onBack={() => {}}
      />,
    );
    await screen.findByText("规范来源地址", { exact: false });
    assert.ok(screen.getByRole("heading", { name: "规范来源名称" }));
    assert.ok(screen.getByText(candidate.reason));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
