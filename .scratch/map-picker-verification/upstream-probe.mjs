// One real request from the deployed host. The key stays in its environment.
// Feed over SSH stdin to Node with the existing --env-file. No automatic retry.
import net from "node:net";

const startedAt = new Date().toISOString();
const start = performance.now();
const key = process.env.AMAP_KEY || process.env.AMAP_WEBSERVICE_KEY;
if (!key) throw new Error("Missing map service key");
const url = new URL("https://restapi.amap.com/v3/staticmap");
url.search = new URLSearchParams({
  key,
  location: "116.397000,39.909000",
  zoom: "15",
  size: "640*480",
  scale: "1",
}).toString();
const report = {
  startedAt,
  runtime: process.version,
  kind: "one direct upstream static-map request in a temporary process on deployed host",
  attemptTimeoutMs: net.getDefaultAutoSelectFamilyAttemptTimeout(),
  passed: false,
};
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(7000), redirect: "error" });
  const bytes = Buffer.from(await response.arrayBuffer());
  report.status = response.status;
  report.contentType = response.headers.get("content-type");
  report.png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (report.png) {
    report.width = bytes.readUInt32BE(16);
    report.height = bytes.readUInt32BE(20);
  } else if (report.contentType?.includes("json")) {
    const body = JSON.parse(bytes.toString());
    report.provider = { status: body.status, info: body.info, infocode: body.infocode };
  }
  report.passed = response.ok && report.png && report.width === 640 && report.height === 480;
} catch (error) {
  report.errorName = error.name;
  report.causeCode = error.cause?.code;
  report.networkErrors = error.cause?.errors?.map((entry) => ({ code: entry.code, syscall: entry.syscall }));
}
report.durationMs = Math.round(performance.now() - start);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
