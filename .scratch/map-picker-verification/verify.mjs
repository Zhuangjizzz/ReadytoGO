// Opt-in verification against the actual public application. Uses real map APIs.
// Run manually; this is deliberately outside the default/offline test suite.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";

const base = process.env.RTG_BROWSER_VERIFY_URL ?? "http://47.85.138.198:3000/";
const output = new URL("../../docs/delivery/evidence/map-picker/", import.meta.url);
await mkdir(output, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  timezone: "Asia/Shanghai",
  target: base,
  transport: "Playwright Chromium, actual public application and real map APIs",
  actualPhone: false,
  scope: "Map point selection and confirmation; no nearby search or model call",
  passed: false,
  checks: [],
};
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();

async function runCase(name, contextOptions, alternativeControls) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const observations = { name, ...contextOptions, apiRequests: {}, responses: [], pageErrors: [] };
  report.checks.push(observations);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) observations.apiRequests[path] = (observations.apiRequests[path] ?? 0) + 1;
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/")) observations.responses.push({ path, status: response.status() });
  });
  page.on("pageerror", (error) => observations.pageErrors.push(error.name));
  try {
    const navigation = await page.goto(base, { waitUntil: "networkidle", timeout: 20000 });
    assert.equal(navigation.status(), 200);
    if (!report.assets) {
      const paths = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("src") ?? element.getAttribute("href")));
      report.assets = [];
      for (const path of paths) {
        const response = await context.request.get(new URL(path, base).href);
        assert.equal(response.status(), 200);
        report.assets.push({ path, sha256: createHash("sha256").update(await response.body()).digest("hex") });
      }
    }
    observations.secureContext = await page.evaluate(() => isSecureContext);
    await page.getByRole("button", { name: "中文", exact: true }).click();
    await page.getByRole("button", { name: "找附近", exact: true }).click();
    await expect(page.getByText("当前浏览器无法定位，请搜索地点或在地图选点。", { exact: true })).toBeVisible();
    observations.geolocationFallbackVisible = true;
    await page.getByRole("button", { name: "选择起点", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "确定此起点", exact: true });
    const mapImage = dialog.getByAltText("高德提供的北京地图底图");

    async function mapAction(action) {
      const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/maps/static");
      await action();
      const response = await responsePromise;
      assert.equal(response.status(), 200, "Actual map image must load");
      assert.match(response.headers()["content-type"], /^image\/png/);
      await expect.poll(() => mapImage.evaluate((image) => image.complete && image.naturalWidth === 640 && image.naturalHeight === 480)).toBe(true);
    }

    await mapAction(() => dialog.getByRole("button", { name: "地图选点", exact: true }).click());
    await expect(confirm).toBeDisabled();
    observations.confirmDisabledUntilPick = true;
    if (alternativeControls) {
      const initialSrc = await mapImage.getAttribute("src");
      await mapAction(() => dialog.getByRole("button", { name: "放大", exact: true }).click());
      const zoomedSrc = await mapImage.getAttribute("src");
      assert.notEqual(initialSrc, zoomedSrc);
      await mapAction(() => dialog.getByRole("button", { name: "向东移动", exact: true }).click());
      assert.notEqual(zoomedSrc, await mapImage.getAttribute("src"));
      observations.zoomAndPan = "passed";
    }

    const resolvePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/location/resolve");
    if (alternativeControls) {
      await dialog.getByRole("button", { name: "选择地图中心", exact: true }).click();
    } else {
      await mapImage.tap({ position: { x: 150, y: 100 } });
    }
    const response = await resolvePromise;
    assert.equal(response.status(), 200, "Map point must resolve to a Beijing origin");
    const request = response.request().postDataJSON();
    const { data: picked } = await response.json();
    assert.equal(picked.city, "北京市");
    assert.equal(picked.position.crs, "GCJ02");
    assert.equal(request.crs, "GCJ02");
    assert.equal(picked.position.lng, request.lng);
    assert.equal(picked.position.lat, request.lat);
    await expect(dialog.locator(".picked-point strong")).toHaveText(picked.nameZh);
    await expect(confirm).toBeEnabled();
    observations.selection = alternativeControls ? "zoom, pan, choose map center" : "touch map at a non-central point";
    observations.resolvedDistrict = picked.district;
    observations.clickedCoordinatesPreserved = true;
    observations.mapDimensions = { width: 640, height: 480 };
    const overflow = await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    assert.equal(overflow, false, "Map picker must not overflow horizontally");
    observations.dialogHorizontalOverflow = false;
    await dialog.screenshot({ path: new URL(`${name}-picked.png`, output).pathname });
    await confirm.scrollIntoViewIfNeeded();
    await page.screenshot({ path: new URL(`${name}-confirm-button.png`, output).pathname });
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".origin-control:visible")).toContainText(picked.nameZh);
    await expect(page.locator(".find-button:visible")).toBeEnabled();
    observations.originConfirmedOnNearbyPage = true;
    await page.locator(".origin-control:visible").scrollIntoViewIfNeeded();
    await page.screenshot({ path: new URL(`${name}-confirmed.png`, output).pathname });
    assert.deepEqual(observations.pageErrors, []);
    assert.equal(observations.apiRequests["/api/v1/location/convert"] ?? 0, 0);
    assert.equal(observations.apiRequests["/api/v1/toilets/search"] ?? 0, 0);
    observations.passed = true;
    console.log(`PASS ${name}: real map → ${observations.selection} → Beijing address → confirm origin`);
  } catch (error) {
    observations.passed = false;
    observations.failure = error.message.split("\n")[0];
    throw error;
  } finally {
    await context.close();
  }
}

try {
  await runCase("touch-390", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, false);
  await runCase("desktop-1280", { viewport: { width: 1280, height: 900 } }, true);
  report.passed = true;
} finally {
  report.finishedAt = new Date().toISOString();
  await browser.close();
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  await writeFile(new URL(`verification-${stamp}.json`, output), JSON.stringify(report, null, 2) + "\n");
}
