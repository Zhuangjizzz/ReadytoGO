import { resolve } from "node:path";
import { importCsv } from "../src/server/data/import.js";
const args = process.argv.slice(2);
function option(name: string, fallback: string) {
  const i = args.indexOf(name);
  return resolve(i >= 0 && args[i + 1] ? args[i + 1] : fallback);
}
const catalog = await importCsv(
  option("--input", "data/BJ-ToiletInfo.csv"),
  option("--output", "data/generated/catalog.json"),
);
console.log(JSON.stringify(catalog.report, null, 2));
