// Isolated component fixtures. This server does not run or access the ReadytoGo app.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium, expect, type Page } from "@playwright/test";

async function withFixture(
  body: string,
  action: (page: Page) => Promise<void>,
  setup?: (page: Page) => Promise<void>,
) {
  const built = await build({
    stdin: {
      contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{StaticMap}from'./src/client/StaticMap';import{Navigation}from'./src/client/Navigation';import{LocateButton}from'./src/client/LocateButton';import{PlacePicker}from'./src/client/PlacePicker';import{PhrasesPage}from'./src/client/PhrasesPage';import{usePageNavigation}from'./src/client/usePageNavigation';import './src/client/styles.css';function Fixture(){${body}}createRoot(document.getElementById('root')).render(<Fixture/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    outdir: "out",
    format: "esm",
    jsx: "automatic",
  });
  const js = built.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
  const css = built.outputFiles.find((f) => f.path.endsWith(".css"))!.text;
  const server = createServer((req, res) => {
    if (req.url === "/fixture.js") {
      res.setHeader("content-type", "text/javascript");
      res.end(js);
    } else if (req.url === "/fixture.css") {
      res.setHeader("content-type", "text/css");
      res.end(css);
    } else if (req.url === "/") {
      res.setHeader("content-type", "text/html");
      res.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
      );
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true }).catch((error) => {
    server.close();
    throw error;
  });
  const page = await browser.newPage({
    viewport: { width: 900, height: 1000 },
  });
  page.setDefaultTimeout(5000);
  try {
    await page.route("**/api/v1/maps/static?**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX+8AAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    if (setup) await setup(page);
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await action(page);
  } finally {
    await browser.close();
    server.close();
  }
}

test("real-map overlay convention matches independently measured Amap marker positions at two zooms and CSS scales", () =>
  withFixture(
    `const center={lng:116.397,lat:39.909,crs:'GCJ02'};const[picked,setPicked]=useState(null);const[chosen,setChosen]=useState(null);return <div style={{width:'min(640px,100%)'}}><StaticMap center={center} language="en" markers={[{id:'blue',position:{lng:116.400,lat:39.911,crs:'GCJ02'},label:'Calibration marker',number:1}]} onPick={setPicked} onSelect={setChosen}/><output>{JSON.stringify(picked)}</output><p role="status">{chosen}</p></div>;`,
    async (page) => {
      const map = page.locator(".static-map");
      const marker = page.getByRole("button", { name: "Calibration marker" });
      await marker.waitFor();
      let frame = (await map.boundingBox())!,
        pin = (await marker.boundingBox())!;
      assert.ok(
        Math.abs(pin.x + pin.width / 2 - frame.x - 390) < 2,
        "native zoom 14 x",
      );
      assert.ok(
        Math.abs(pin.y + pin.height - frame.y - 179) < 2,
        "native zoom 14 y",
      );
      await page.getByRole("button", { name: "Zoom in" }).click();
      await marker.waitFor();
      frame = (await map.boundingBox())!;
      pin = (await marker.boundingBox())!;
      assert.ok(
        Math.abs(pin.x + pin.width / 2 - frame.x - 460) < 2,
        "native zoom 15 x",
      );
      assert.ok(
        Math.abs(pin.y + pin.height - frame.y - 118) < 2,
        "native zoom 15 y",
      );
      await page.setViewportSize({ width: 320, height: 700 });
      frame = (await map.boundingBox())!;
      pin = (await marker.boundingBox())!;
      assert.ok(
        Math.abs(pin.x + pin.width / 2 - frame.x - 230) < 2,
        "half-width overlay x",
      );
      assert.ok(
        Math.abs(pin.y + pin.height - frame.y - 59) < 2,
        "half-width overlay y",
      );
      await marker.click();
      assert.equal(await page.locator("p[role=status]").textContent(), "blue");
      // Click an unobstructed point at the independently measured opposite displacement.
      await page.mouse.click(frame.x + 90, frame.y + 181);
      const picked = JSON.parse((await page.locator("output").textContent())!);
      assert.ok(Math.abs(picked.lng - 116.394) < 0.00005);
      assert.ok(Math.abs(picked.lat - 39.907) < 0.00005);
      await page.getByRole("button", { name: "Pan east" }).click();
      await page.getByRole("button", { name: "Choose map center" }).click();
      const panned = JSON.parse((await page.locator("output").textContent())!);
      assert.ok(panned.lng > 116.397);
      assert.ok(Math.abs(panned.lat - 39.909) < 0.00005);
    },
  ));

test("navigation clears previous route values while switching origin and retains valid web handoff after route failure", () =>
  withFixture(
    `return <Navigation toiletId="park-wc" origin={{lng:116.4,lat:39.9,crs:'GCJ02',label:'Chosen entrance',source:'place'}} language="en"/>;`,
    async (page) => {
      await page.getByText("2 min · 240 m", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "From current location", exact: true })
        .click();
      await page
        .getByText("Calculating walking route…", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByText("2 min · 240 m", { exact: true }).count(),
        0,
      );
      await page
        .getByText("Walking time unavailable", { exact: true })
        .waitFor();
      const href = await page
        .getByRole("link", { name: "Open web route" })
        .getAttribute("href");
      assert.ok(href);
      assert.equal(
        new URL(href).searchParams.get("from"),
        "116.45,39.93,Current location",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Copy Chinese name & address" })
          .count(),
        1,
      );
      await page
        .getByRole("button", {
          name: "From selected starting point",
          exact: true,
        })
        .click();
      await page.getByText("2 min · 240 m", { exact: true }).waitFor();
    },
    async (page) => {
      await page.context().grantPermissions(["geolocation"]);
      await page
        .context()
        .setGeolocation({ longitude: 116.444, latitude: 39.929, accuracy: 30 });
      await page.route("**/api/v1/location/convert", (route) =>
        route.fulfill({
          json: {
            data: {
              lng: 116.45,
              lat: 39.93,
              crs: "GCJ02",
              source: "geolocation",
              label: "Current location",
              accuracyMeters: 30,
            },
            warnings: [],
          },
        }),
      );
      await page.route("**/api/v1/navigation/link", async (route) => {
        const body = route.request().postDataJSON();
        const current = body.origin.source === "geolocation";
        if (current) await new Promise((r) => setTimeout(r, 400));
        const url = new URL("https://uri.amap.com/navigation");
        url.search = new URLSearchParams({
          from: `${body.origin.lng},${body.origin.lat},${body.origin.label}`,
          to: "116.405,39.905,公园厕所",
          mode: "walk",
          callnative: "0",
        }).toString();
        await route.fulfill({
          json: {
            data: {
              origin: body.origin,
              destination: { lng: 116.405, lat: 39.905, crs: "GCJ02" },
              webUrl: url.toString(),
              appUrl: url.toString().replace("callnative=0", "callnative=1"),
              searchUrl: "https://uri.amap.com/search?keyword=公园厕所",
              copyText: "公园厕所\n园路12号",
              routeStatus: current ? "provider_error" : "success",
              walkSeconds: current ? null : 120,
              walkMeters: current ? null : 240,
            },
            warnings: [],
          },
        });
      });
    },
  ));

test("GPS permission failure keeps manual place search usable and fixed phrase cards work in landscape", () =>
  withFixture(
    `const[phrases,setPhrases]=useState(false);const[open,setOpen]=useState(true);return phrases?<PhrasesPage language="en" onBack={()=>setPhrases(false)}/>:<><button onClick={()=>setPhrases(true)}>Open phrase cards</button>{open&&<PlacePicker language="en" onClose={()=>setOpen(false)} onSelect={()=>{}}/>}</>;`,
    async (page) => {
      await page
        .getByRole("button", { name: "Use current location", exact: true })
        .click();
      await page
        .getByText("Location permission was declined.", { exact: false })
        .waitFor();
      assert.equal(
        await page.getByRole("textbox", { name: "Place name" }).isEnabled(),
        true,
      );
      assert.equal(
        await page.getByRole("button", { name: "Choose on map" }).isEnabled(),
        true,
      );
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("button", { name: "Open phrase cards" }).click();
      assert.equal(await page.locator(".phrase-tile").count(), 5);
      await page.locator(".phrase-tile").first().click();
      await page
        .getByRole("heading", { name: "请问这里有成人可用的坐便器吗？" })
        .waitFor();
      await page.getByRole("button", { name: "Next" }).click();
      assert.equal(
        await page
          .getByRole("heading", { name: "请问厕所现在开放吗？" })
          .count(),
        1,
      );
      await page.setViewportSize({ width: 740, height: 390 });
      const font = await page
        .locator(".phrase-card h2")
        .evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        );
      assert.ok(font >= 28);
      assert.ok(
        (await page.getByRole("button", { name: "Next" }).boundingBox())!
          .height >= 44,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    },
    async (page) => {
      await page.context().clearPermissions();
    },
  ));

test("pending map images disable pick actions so old artwork never supplies coordinates for a new viewport", () =>
  withFixture(
    `const center={lng:116.397,lat:39.909,crs:'GCJ02'};const[picked,setPicked]=useState(null);return <div style={{width:640}}><StaticMap center={center} language="en" onPick={setPicked}/><output>{JSON.stringify(picked)}</output></div>;`,
    async (page) => {
      await page.getByRole("button", { name: "Choose map center" }).waitFor();
      await expect(
        page.getByRole("button", { name: "Choose map center" }),
      ).toBeEnabled();
      await page.route("**/api/v1/maps/static?**", async (route) => {
        await new Promise((r) => setTimeout(r, 300));
        await route.abort();
      });
      await page.getByRole("button", { name: "Zoom in" }).click();
      assert.equal(
        await page
          .getByRole("button", { name: "Choose map center" })
          .isDisabled(),
        true,
      );
      const frame = (await page.locator(".static-map").boundingBox())!;
      await page.mouse.click(frame.x + 150, frame.y + 150);
      assert.equal(await page.locator("output").textContent(), "null");
      await page.getByText("Map unavailable", { exact: true }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Retry map" }).isEnabled(),
        true,
      );
    },
  ));

test("returning from details restores the preserved list scroll position", () =>
  withFixture(
    `const{path,navigate}=usePageNavigation();return <><section hidden={path!=='/'} style={{height:1800,paddingTop:700}}><button onClick={()=>navigate('/toilets/public-id')}>Read details</button><p>Preserved results</p></section>{path!=='/'&&<section style={{height:1000}}><button onClick={()=>navigate('/')}>Back to results</button><h1>Details</h1></section>}</>;`,
    async (page) => {
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.getByRole("button", { name: "Read details" }).click();
      await page.getByRole("heading", { name: "Details" }).waitFor();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.getByRole("button", { name: "Back to results" }).click();
      await page.getByText("Preserved results", { exact: true }).waitFor();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
    },
  ));
