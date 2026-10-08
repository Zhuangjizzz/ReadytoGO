import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

test(
  "the launched service honors a loopback HOST and imports data in its configured state directory",
  { timeout: 15_000 },
  async () => {
    // A specific IPv6 loopback makes an accidental 0.0.0.0 bind observable
    // through HTTP rather than trusting a config object or startup log.
    const probe = createServer();
    probe.listen(0, "::1");
    await once(probe, "listening");
    const address = probe.address();
    assert.ok(address && typeof address !== "string");
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const state = await mkdtemp(join(tmpdir(), "readytogo-runtime-"));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/server/main.ts"],
      {
        env: {
          ...process.env,
          HOST: "::1",
          PORT: String(address.port),
          CATALOG_PATH: join(state, "catalog.json"),
          MATCH_CACHE_PATH: "",
          AMAP_KEY: "",
          AMAP_WEBSERVICE_KEY: "",
          DASHSCOPE_API_KEY: "",
          QWEN_MODEL: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const exited = once(child, "exit");
    // Consume logs without writing them into the test report.
    child.stdout.resume();
    child.stderr.resume();
    try {
      const base = `http://[::1]:${address.port}`;
      let health: Response | undefined;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          health = await fetch(`${base}/health`, {
            signal: AbortSignal.timeout(200),
          });
          break;
        } catch {
          assert.equal(
            child.exitCode,
            null,
            "service exited before becoming ready",
          );
          await delay(100);
        }
      }
      assert.ok(
        health?.ok,
        "service must answer at its configured loopback address",
      );
      assert.equal((await health.json()).service, "readytogo");
      const summary = await fetch(`${base}/api/v1/data/summary`);
      assert.equal((await summary.json()).data.importedCount, 13_124);
      await assert.rejects(
        fetch(`http://127.0.0.1:${address.port}/health`, {
          signal: AbortSignal.timeout(300),
        }),
        "binding ::1 must not also publish the service on IPv4",
      );
    } finally {
      child.kill("SIGTERM");
      await exited;
      await rm(state, { recursive: true, force: true });
    }
  },
);
