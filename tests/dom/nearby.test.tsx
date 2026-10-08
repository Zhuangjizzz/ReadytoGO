import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { useState } from "react";
import type {
  Candidate,
  Language,
  SearchRequest,
  SearchResult,
} from "../../src/shared/contracts.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://isolated-component.invalid",
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
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};
const { render, screen, waitFor, cleanup, act, fireEvent } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { NearbyPage } = await import("../../src/client/NearbyPage.js");
const { MapPanel } = await import("../../src/client/MapPanel.js");
const origin = {
  lng: 116.4,
  lat: 39.9,
  crs: "GCJ02",
  label: "选择的起点",
  source: "place",
} as const;
function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    toiletId: id,
    nameZh: id,
    nameEn: null,
    addressZh: "地址",
    district: "东城区",
    position: origin,
    seatStatus: "inferred",
    seatBasis: [],
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
    accessCondition: "unknown",
    accessNote: null,
    routeStatus: "success",
    walkSeconds: 1,
    walkMeters: 1,
    straightLineMeters: 1,
    reason: "source description",
    sources: [],
    ...overrides,
  };
}
function response(
  request: SearchRequest,
  rows: Candidate[],
  group: "matched" | "routeUnknown" = "matched",
  extra: Partial<SearchResult> = {},
) {
  const data: SearchResult = {
    status: "complete",
    queryVersion: request.queryVersion,
    origin,
    groups: {
      matched: [],
      farther: [],
      otherNearby: [],
      conditionalAccess: [],
      routeUnknown: [],
      [group]: rows,
    },
    analysisStatus: "fallback",
    summary: "done",
    pendingWork: false,
    hasMore: false,
    nextCursor: null,
    batchCursor: "batch-" + request.queryVersion,
    ...extra,
  };
  return new Response(
    JSON.stringify({ requestId: "dom", data, warnings: [] }),
    { headers: { "content-type": "application/json" } },
  );
}
function Harness() {
  const [preference, setPreference] = useState<"any" | "seated_required">(
    "any",
  );
  return (
    <NearbyPage
      language="en"
      origin={origin}
      onOriginChange={() => {}}
      preference={preference}
      onPreferenceChange={setPreference}
    />
  );
}

test("offline DOM: a delayed old search cannot overwrite the changed preference, even if transport ignores abort", async () => {
  const originalFetch = globalThis.fetch;
  const pending: Array<{
    request: SearchRequest;
    resolve: (r: Response) => void;
  }> = [];
  globalThis.fetch = async (_url, init) =>
    new Promise((resolve) =>
      pending.push({ request: JSON.parse(String(init?.body)), resolve }),
    );
  try {
    render(<Harness />);
    const user = userEvent.setup({ document: dom.window.document });
    await user.click(
      screen.getAllByRole("button", { name: "Find a toilet" })[0],
    );
    await waitFor(() => assert.equal(pending.length, 1));
    await user.click(
      screen.getByRole("radio", { name: "Seated toilet needed" }),
    );
    await waitFor(() => assert.equal(pending.length, 2));
    await act(async () =>
      pending[1].resolve(
        response(pending[1].request, [candidate("new-result")]),
      ),
    );
    await screen.findByText("new-result");
    await act(async () =>
      pending[0].resolve(
        response(pending[0].request, [candidate("obsolete-result")]),
      ),
    );
    assert.equal(screen.queryByText("obsolete-result"), null);
    assert.ok(screen.getByText("new-result"));
    assert.ok(screen.getByText("1 min · 1 m"));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
test("offline DOM: terminal partial results stop polling and ordinary unknown-route alternatives require expansion", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    const request = JSON.parse(String(init?.body)) as SearchRequest;
    return response(
      request,
      [
        candidate("ordinary-alternative", {
          seatStatus: "unknown",
          routeStatus: "provider_error",
          walkSeconds: null,
          walkMeters: null,
          ordinaryAlternative: true,
        }),
      ],
      "routeUnknown",
      { status: "partial" },
    );
  };
  try {
    render(<Harness />);
    const user = userEvent.setup({ document: dom.window.document });
    await user.click(
      screen.getByRole("radio", { name: "Seated toilet needed" }),
    );
    await user.click(
      screen.getAllByRole("button", { name: "Find a toilet" })[0],
    );
    await screen.findByRole("button", { name: /Show ordinary alternatives/ });
    assert.equal(screen.queryByText("ordinary-alternative"), null);
    await user.click(
      screen.getByRole("button", { name: /Show ordinary alternatives/ }),
    );
    assert.ok(screen.getByText("ordinary-alternative"));
    assert.ok(screen.getAllByText("Walking time unavailable").length);
    await new Promise((r) => setTimeout(r, 650));
    assert.equal(requests, 1);
    assert.equal(screen.queryByText(/1 min/), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("choosing already selected nearby limits leaves a pending search running to completion", async () => {
  const originalFetch = globalThis.fetch;
  let finished = false;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/places/search"))
      return new Response(
        JSON.stringify({
          requestId: "offline",
          warnings: [],
          data: {
            places: [
              {
                provider: "amap",
                poiId: "same-origin",
                nameZh: origin.label,
                nameEn: null,
                addressZh: "原有地址",
                district: "东城区",
                city: "北京市",
                position: origin,
                originType: "poi",
              },
            ],
            hasMore: false,
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    const request = JSON.parse(String(init?.body)) as SearchRequest;
    if (request.cursor) {
      finished = true;
      return response(request, [candidate("completed-candidate")]);
    }
    return response(request, [candidate("pending-candidate")], "matched", {
      status: "partial",
      analysisStatus: "pending",
      pendingWork: true,
    });
  };
  try {
    render(<Harness />);
    const user = userEvent.setup({ document: dom.window.document });
    await user.click(
      screen.getByRole("radio", { name: "Seated toilet needed" }),
    );
    await user.click(
      screen.getAllByRole("button", { name: "Find a toilet" })[0],
    );
    await screen.findByText("pending-candidate");
    await user.click(screen.getByRole("button", { name: "10 min" }));
    await user.click(screen.getByRole("button", { name: "5 km" }));
    await user.click(
      screen.getByRole("radio", { name: "Seated toilet needed" }),
    );
    await user.click(
      screen.getByRole("button", { name: /选择的起点Change starting point/ }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Place name" }), {
      target: { value: "起点" },
    });
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(
      await screen.findByRole("button", { name: /选择的起点.*原有地址/ }),
    );
    await screen.findByText("completed-candidate");
    assert.equal(finished, true);
    assert.equal(screen.queryByText(/Adding candidate explanations/), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("changing nearby language retains the selected alternative and map viewport while updating reasons", async () => {
  const originalFetch = globalThis.fetch;
  let finishChinese!: () => void;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as SearchRequest;
    if (request.language === "zh-CN")
      await new Promise<void>((resolve) => {
        finishChinese = resolve;
      });
    return response(request, [
      candidate("selected-alternative", {
        reason:
          request.language === "en"
            ? "English facility explanation"
            : "中文设施说明",
        ordinaryAlternative: true,
        seatStatus: "unknown",
      }),
    ]);
  };
  function LanguageHarness() {
    const [language, setLanguage] = useState<Language>("en");
    return (
      <>
        <button onClick={() => setLanguage("zh-CN")}>中文</button>
        <NearbyPage
          language={language}
          origin={origin}
          onOriginChange={() => {}}
          preference="seated_required"
          onPreferenceChange={() => {}}
          MapComponent={MapPanel}
        />
      </>
    );
  }
  try {
    render(<LanguageHarness />);
    const user = userEvent.setup({ document: dom.window.document });
    await user.click(
      screen.getAllByRole("button", { name: "Find a toilet" })[0],
    );
    await user.click(
      await screen.findByRole("button", { name: /Show ordinary alternatives/ }),
    );
    await user.click(screen.getByText("selected-alternative"));
    await user.click(screen.getByRole("button", { name: "Map" }));
    const map = screen.getByAltText("Beijing map provided by Amap");
    fireEvent.load(map);
    await user.click(screen.getByRole("button", { name: "Pan east" }));
    fireEvent.load(screen.getByAltText("Beijing map provided by Amap"));
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    const viewport = screen
      .getByAltText("Beijing map provided by Amap")
      .getAttribute("src");
    await user.click(screen.getByRole("button", { name: "中文" }));
    await waitFor(() => assert.equal(typeof finishChinese, "function"));
    assert.equal(
      screen.getByAltText("高德提供的北京地图底图").getAttribute("src"),
      viewport,
    );
    assert.equal(screen.queryByText("English facility explanation"), null);
    await act(async () => finishChinese());
    await screen.findByText("中文设施说明");
    assert.equal(
      screen
        .getByRole("button", { name: /收起普通厕所/ })
        .getAttribute("aria-expanded"),
      "true",
    );
    assert.equal(
      screen.getByRole("article").classList.contains("is-selected"),
      true,
    );
    assert.equal(
      screen.getByAltText("高德提供的北京地图底图").getAttribute("src"),
      viewport,
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("nearby pagination replaces a provider alias with its canonical record and keeps order and latest page controls", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as SearchRequest;
    if (request.cursor === "second")
      return response(
        request,
        [
          candidate("canonical-place", {
            walkSeconds: 60,
            sources: [
              {
                provider: "amap",
                name: "Map source",
                poiId: "alias",
                rawFields: {},
              },
            ],
          }),
          candidate("new-place", { walkSeconds: 120 }),
        ],
        "matched",
        {
          batchCursor: "second",
          hasMore: true,
          nextCursor: "third",
        },
      );
    if (request.cursor === "third")
      return response(request, [], "matched", {
        status: "empty",
        batchCursor: "third",
      });
    return response(
      request,
      [
        candidate("amap_alias", { walkSeconds: 90 }),
        candidate("further-place", { walkSeconds: 180 }),
      ],
      "matched",
      {
        status: "partial",
        batchCursor: "first",
        hasMore: true,
        nextCursor: "second",
      },
    );
  };
  try {
    render(<Harness />);
    const user = userEvent.setup({ document: dom.window.document });
    await user.click(
      screen.getAllByRole("button", { name: "Find a toilet" })[0],
    );
    await user.click(await screen.findByText("amap_alias"));
    await user.click(
      await screen.findByRole("button", { name: "Load more options" }),
    );
    await screen.findByText("canonical-place");
    assert.equal(Boolean(screen.queryByText("amap_alias")), false);
    assert.deepEqual(
      screen
        .getAllByRole("article")
        .map((row) => row.getAttribute("data-toilet-id")),
      ["canonical-place", "new-place", "further-place"],
    );
    assert.equal(
      screen.getAllByRole("article")[0].classList.contains("is-selected"),
      true,
    );
    assert.ok(
      screen.getByText(
        "Some information is unavailable. Available results are kept.",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Load more options" }));
    await waitFor(() =>
      assert.equal(
        screen.queryByRole("button", { name: "Load more options" }),
        null,
      ),
    );
    assert.equal(screen.getAllByRole("article").length, 3);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("a language refresh retains a selected later-page candidate and refreshes only the pages already loaded", async () => {
  const originalFetch = globalThis.fetch;
  let finishSecond!: () => void;
  let wentBeyondLoaded = false;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as SearchRequest;
    const zh = request.language === "zh-CN";
    const second = request.cursor === (zh ? "second-zh" : "second-en");
    if (request.cursor?.startsWith("third")) wentBeyondLoaded = true;
    if (zh && second)
      await new Promise<void>((resolve) => {
        finishSecond = resolve;
      });
    return response(
      request,
      [
        candidate(second ? "later-choice" : "first-choice", {
          reason: zh
            ? second
              ? "中文后页说明"
              : "中文首批说明"
            : second
              ? "Later page explanation"
              : "First page explanation",
        }),
      ],
      "matched",
      {
        batchCursor: `${second ? "second" : "first"}-${zh ? "zh" : "en"}`,
        hasMore: true,
        nextCursor: `${second ? "third" : "second"}-${zh ? "zh" : "en"}`,
      },
    );
  };
  function LanguageHarness() {
    const [language, setLanguage] = useState<Language>("en");
    return (
      <>
        <button onClick={() => setLanguage("zh-CN")}>中文</button>
        <NearbyPage
          language={language}
          origin={origin}
          onOriginChange={() => {}}
          preference="any"
          onPreferenceChange={() => {}}
        />
      </>
    );
  }
  try {
    render(<LanguageHarness />);
    const user = userEvent.setup({ document: dom.window.document });
    await user.click(
      screen.getAllByRole("button", { name: "Find a toilet" })[0],
    );
    await user.click(
      await screen.findByRole("button", { name: "Load more options" }),
    );
    await user.click(await screen.findByText("later-choice"));
    await user.click(screen.getByRole("button", { name: "中文" }));
    await screen.findByText("中文首批说明");
    assert.equal(Boolean(screen.queryByText("later-choice")), true);
    assert.equal(Boolean(screen.queryByText("Later page explanation")), false);
    assert.equal(
      screen
        .getByText("later-choice")
        .closest("article")!
        .classList.contains("is-selected"),
      true,
    );
    await waitFor(() => assert.equal(typeof finishSecond, "function"));
    await act(async () => finishSecond());
    await screen.findByText("中文后页说明");
    assert.equal(
      screen
        .getByText("later-choice")
        .closest("article")!
        .classList.contains("is-selected"),
      true,
    );
    assert.equal(wentBeyondLoaded, false);
    assert.equal(
      (screen.getByRole("button", { name: "加载更多" }) as HTMLButtonElement)
        .disabled,
      false,
    );
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});

test("an empty pending language batch keeps the selected source candidate until its terminal replacement", async () => {
  const originalFetch = globalThis.fetch;
  let finishPending!: () => void;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as SearchRequest;
    if (request.language === "en")
      return response(request, [
        candidate("chosen-source", { reason: "Original English explanation" }),
      ]);
    if (!request.cursor)
      return response(request, [], "matched", {
        status: "partial",
        pendingWork: true,
        analysisStatus: "pending",
        batchCursor: "new-language-batch",
      });
    await new Promise<void>((resolve) => {
      finishPending = resolve;
    });
    return response(
      request,
      [
        candidate("chosen-source", {
          reason: "新的中文说明",
          walkSeconds: 120,
        }),
      ],
      "matched",
      {
        batchCursor: "new-language-batch",
      },
    );
  };
  function LanguageHarness() {
    const [language, setLanguage] = useState<Language>("en");
    return (
      <>
        <button onClick={() => setLanguage("zh-CN")}>中文</button>
        <NearbyPage
          language={language}
          origin={origin}
          onOriginChange={() => {}}
          preference="any"
          onPreferenceChange={() => {}}
        />
      </>
    );
  }
  try {
    render(<LanguageHarness />);
    const user = userEvent.setup({ document: dom.window.document });
    await user.click(
      screen.getAllByRole("button", { name: "Find a toilet" })[0],
    );
    await user.click(await screen.findByText("chosen-source"));
    await user.click(screen.getByRole("button", { name: "中文" }));
    await screen.findByText("正在补充候选分析；现有结果可继续使用。");
    assert.equal(Boolean(screen.queryByText("chosen-source")), true);
    assert.equal(
      screen.getByRole("article").classList.contains("is-selected"),
      true,
    );
    assert.equal(
      Boolean(screen.queryByText("Original English explanation")),
      false,
    );
    await waitFor(() => assert.equal(typeof finishPending, "function"));
    await act(async () => finishPending());
    await screen.findByText("新的中文说明");
    assert.equal(
      screen.getByRole("article").classList.contains("is-selected"),
      true,
    );
    assert.equal(screen.getAllByRole("article").length, 1);
    assert.ok(screen.getByText("2 分钟 · 1 m"));
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
