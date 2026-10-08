import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import iconv from "iconv-lite";
import { createApplication } from "../src/server/app.js";
import type {
  ApiSuccess,
  ImportReport,
  Toilet,
} from "../src/shared/contracts.js";
const exec = promisify(execFile);

test("formal GB18030 import preserves zero, adjacent facility meanings and repeatable identities through HTTP", async () => {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-import-"));
  const row = [
    "1",
    "园路公厕",
    "东城区",
    "街道",
    "单位",
    "001",
    "园路1号",
    "116°24′00″",
    "39°54′00″",
    "",
    "二类",
    "",
    "",
    "",
    "现有",
    "0",
    "",
    "2",
    "1",
    "无",
    "有",
    "无",
    "0",
    "有",
    "无",
    "",
    "",
  ];
  const input = join(dir, "source.csv");
  const output = join(dir, "catalog.json");
  await writeFile(
    input,
    iconv.encode(
      [
        ",,,,,,,,,,,台账",
        "序号,厕所名称,所在区县",
        row.join(","),
        ["2", ...row.slice(1)].join(","),
      ].join("\r\n"),
      "gb18030",
    ),
  );
  try {
    const first = JSON.parse(
      (
        await exec(process.execPath, [
          "--import",
          "tsx",
          "scripts/import-data.ts",
          "--input",
          input,
          "--output",
          output,
        ])
      ).stdout,
    ) as ImportReport;
    const again = JSON.parse(
      (
        await exec(process.execPath, [
          "--import",
          "tsx",
          "scripts/import-data.ts",
          "--input",
          input,
          "--output",
          output,
        ])
      ).stdout,
    ) as ImportReport;
    assert.equal(first.inputRecords, 2);
    assert.equal(first.importedCount, 1);
    assert.equal(first.mergedCount, 1);
    assert.deepEqual(again.sampleToiletIds, first.sampleToiletIds);
    const { app } = await createApplication({ catalogPath: output });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const res = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/toilets/${first.sampleToiletIds[0]}`,
      );
      const { data } = (await res.json()) as ApiSuccess<Toilet>;
      assert.equal(res.status, 200);
      assert.equal(data.nameZh, "园路公厕");
      assert.equal(data.facilities.maleStalls, 0);
      assert.equal(data.facilities.femaleStalls, null);
      assert.equal(data.facilities.thirdRestroom, 1);
      assert.equal(data.facilities.accessibility, false);
      assert.equal(data.facilities.accessibleRoom, true);
      assert.equal(data.facilities.accessibleStalls, 0);
      assert.equal(data.facilities.managementRoom, true);
      assert.equal(data.facilities.washroom, false);
      assert.deepEqual(data.sourcePosition, {
        lng: 116.4,
        lat: 39.9,
        crs: "unknown",
      });
      assert.equal(data.position, null);
      assert.equal(data.sources.length, 2);
    } finally {
      server.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the original government file imports completely despite unquoted DMS seconds marks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-original-"));
  try {
    const { stdout } = await exec(process.execPath, [
      "--import",
      "tsx",
      "scripts/import-data.ts",
      "--output",
      join(dir, "catalog.json"),
    ]);
    const report = JSON.parse(stdout) as ImportReport;
    assert.equal(report.inputRecords, 13156);
    assert.equal(report.skippedCount, 0);
    assert.equal(report.importedCount + report.mergedCount, 13156);
    assert.equal(report.usablePositionCount, 0);
    assert.ok(report.parsedPositionCount > 7000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("formal import preserves an unopened source note as unavailable in public details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "readytogo-unopened-import-"));
  const input = join(dir, "source.csv");
  const output = join(dir, "catalog.json");
  const note = "设施已建成；尚未对外开放。";
  const row = [
    "1",
    "示例路公厕",
    "东城区",
    "街道",
    "单位",
    "source-unopened",
    "示例路1号",
    "116.4",
    "39.9",
    "",
    "二类",
    "",
    "",
    "",
    "现有",
    "3",
    "4",
    "1",
    "1",
    "有",
    "有",
    "无",
    "1",
    "有",
    "有",
    "",
    note,
  ];
  await writeFile(
    input,
    iconv.encode(
      [
        "序号,厕所名称,所在区县",
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
      ].join("\r\n"),
      "gb18030",
    ),
  );
  try {
    const { stdout } = await exec(process.execPath, [
      "--import",
      "tsx",
      "scripts/import-data.ts",
      "--input",
      input,
      "--output",
      output,
    ]);
    const report = JSON.parse(stdout) as ImportReport;
    assert.equal(report.importedCount, 1);
    const { app } = await createApplication({
      catalogPath: output,
      qwenKey: "",
      logger: () => {},
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const reply = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/toilets/${report.sampleToiletIds[0]}`,
      );
      assert.equal(reply.status, 200);
      const { data } = (await reply.json()) as ApiSuccess<Toilet>;
      assert.equal(data.availability, "out_of_service");
      assert.equal(data.facilities.notes, note);
      assert.equal(data.sources[0].rawFields["指标状况"], "现有");
      assert.equal(data.sources[0].rawFields["备注"], note);
    } finally {
      server.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
