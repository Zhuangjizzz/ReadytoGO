// Explicitly invoked, bounded real-provider release check. Never part of npm test.
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const [base, label, revision, query, text, option] = process.argv.slice(2);
if (!base || !label || !revision || !query || !text)
  throw new Error("base, label, revision, query and test text are required");
const started = Date.now();
const out = {
  schema: "readytogo.release-http.v1",
  generatedAt: new Date().toISOString(),
  label,
  revision,
  transport: "HTTP only; no browser",
  testInput: { query, text },
  requests: {},
  checks: {},
};
const overall = AbortSignal.timeout(135_000);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function json(path, body) {
  const begin = Date.now();
  const response = await fetch(new URL(path, base), {
    ...(body
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.any([overall, AbortSignal.timeout(100_000)]),
  });
  const data = await response.json();
  const route = path.split("?")[0];
  const old = out.requests[route];
  out.requests[route] = {
    count: (old?.count ?? 0) + 1,
    firstRequestId: old?.firstRequestId ?? data.requestId ?? null,
    lastRequestId: data.requestId ?? null,
    lastStatus: response.status,
    totalHttpMs: (old?.totalHttpMs ?? 0) + Date.now() - begin,
    errorCode: data.error?.code ?? null,
  };
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status} ${route} ${data.error?.code ?? ""}`,
    );
  return data;
}
try {
  out.health = await json("/health");
  out.checks.correctService =
    out.health.status === "ok" && out.health.service === "readytogo";
  const source = (await json("/api/v1/data/summary")).data;
  out.import = {
    inputRecords: source.inputRecords,
    importedCount: source.importedCount,
    mergedCount: source.mergedCount,
  };
  out.checks.sourceImported = source.importedCount === 13124;
  const html = await fetch(new URL("/", base), { signal: overall });
  const content = await html.text();
  const assets = [...content.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p.startsWith("/assets/"));
  out.assets = [];
  for (const path of assets) {
    const res = await fetch(new URL(path, base), { signal: overall });
    const bytes = Buffer.from(await res.arrayBuffer());
    out.assets.push({
      path,
      status: res.status,
      bytes: bytes.length,
      sha256: digest(bytes),
    });
  }
  out.checks.clientAssets =
    html.ok &&
    assets.length >= 2 &&
    out.assets.every((a) => a.status === 200 && a.bytes > 0);
  if (option === "--skip-parse") {
    out.parse = {
      skipped: true,
      reason: "Same-code stage parse evidence is reused; no new parse call.",
    };
  } else {
    const parseBegin = Date.now();
    const parsed = await json("/api/v1/assist/parse", {
      text,
      mode: "itinerary",
      language: "en",
      preference: "seated_required",
    });
    out.parse = {
      elapsedMs: Date.now() - parseBegin,
      status: parsed.data.status,
      proposedPreference: parsed.data.proposedPreference,
      places: parsed.data.placeQueries,
      warnings: parsed.data.warnings,
    };
  }
  const search = await json(
    `/api/v1/places/search?q=${encodeURIComponent(query)}&language=en`,
  );
  const place = search.data.places[0];
  if (!place?.position) throw new Error("No selectable place returned");
  out.place = {
    nameZh: place.nameZh,
    poiId: place.poiId,
    district: place.district,
    returnedChoices: search.data.places.length,
  };
  const settings = {
    revision: 1,
    language: "en",
    preference: "seated_required",
    includeConditionalAccess: true,
    walkLimitMinutes: 20,
    extendedRadiusKm: 5,
  };
  out.previewRequestSettings = settings;
  out.flowNote =
    "Parse and preview are separate release checks; no saved user plan is changed.";
  const previewBegin = Date.now();
  let stop;
  let cursor;
  for (let n = 0; n < 100 && Date.now() - previewBegin < 100_000; n++) {
    const response = await json("/api/v1/plans/preview", {
      ...settings,
      stops: [
        { stopId: "release-check", place, ...(cursor ? { cursor } : {}) },
      ],
    });
    stop = response.data.stops[0];
    if (!stop.result?.pendingWork) break;
    cursor = stop.result.batchCursor;
    if (!cursor) throw new Error("Pending result has no current batch cursor");
    await delay(800);
  }
  const result = stop?.result;
  const candidates = result ? Object.values(result.groups).flat() : [];
  const successful = candidates.filter((c) => c.routeStatus === "success");
  const chosen = stop?.primary ?? successful[0];
  out.preview = {
    elapsedMs: Date.now() - previewBegin,
    status: result?.status ?? null,
    analysisStatus: result?.analysisStatus ?? null,
    pendingWork: result?.pendingWork ?? null,
    hasMore: result?.hasMore ?? null,
    groupCounts: result
      ? Object.fromEntries(
          Object.entries(result.groups).map(([k, v]) => [k, v.length]),
        )
      : {},
    returnedCandidates: candidates.length,
    successfulRoutes: successful.length,
    error: stop?.error ?? null,
  };
  out.checks.terminalPreviewWithRoute =
    !!result && !result.pendingWork && successful.length > 0;
  if (chosen) {
    out.candidate = {
      toiletId: chosen.toiletId,
      nameZh: chosen.nameZh,
      seatStatus: chosen.seatStatus,
      walkSeconds: chosen.walkSeconds,
      walkMeters: chosen.walkMeters,
      reason: chosen.reason,
      sources: chosen.sources.map((s) => s.provider),
    };
    const detail = await json(
      `/api/v1/toilets/${encodeURIComponent(chosen.toiletId)}`,
    );
    out.checks.detailIdentity = detail.data.id === chosen.toiletId;
    const origin = { ...place.position, source: "place", label: place.nameZh };
    const nav = await json("/api/v1/navigation/link", {
      toiletId: chosen.toiletId,
      origin,
      language: "en",
    });
    out.navigation = {
      routeStatus: nav.data.routeStatus,
      walkSeconds: nav.data.walkSeconds,
      walkMeters: nav.data.walkMeters,
      hasAppUrl: !!nav.data.appUrl,
      hasWebUrl: !!nav.data.webUrl,
      hasCopyText: !!nav.data.copyText,
    };
    out.checks.navigationMatches =
      nav.data.routeStatus === "success" &&
      nav.data.walkSeconds === chosen.walkSeconds &&
      nav.data.walkMeters === chosen.walkMeters &&
      out.navigation.hasAppUrl &&
      out.navigation.hasWebUrl &&
      out.navigation.hasCopyText;
  }
  const image = await fetch(
    new URL(
      `/api/v1/maps/static?lng=${place.position.lng}&lat=${place.position.lat}&zoom=14&width=640&height=480`,
      base,
    ),
    { signal: overall },
  );
  const bytes = Buffer.from(await image.arrayBuffer());
  const png =
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  out.map = {
    status: image.status,
    contentType: image.headers.get("content-type"),
    validPng: png,
    width: png ? bytes.readUInt32BE(16) : null,
    height: png ? bytes.readUInt32BE(20) : null,
  };
  out.checks.mapImage = image.ok && png;
  out.elapsedMs = Date.now() - started;
  out.technicalChecksPass = Object.values(out.checks).every(Boolean);
  if (!out.technicalChecksPass) process.exitCode = 1;
} catch (error) {
  out.elapsedMs = Date.now() - started;
  out.failure = error instanceof Error ? error.message : "Unknown failure";
  out.technicalChecksPass = false;
  process.exitCode = 1;
}
console.log(JSON.stringify(out, null, 2));
