import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { useState } from "react";
import type {
  Candidate,
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
const { render, screen, waitFor, cleanup, act } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { NearbyPage } = await import("../../src/client/NearbyPage.js");
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
