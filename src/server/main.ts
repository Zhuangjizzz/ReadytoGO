import { access } from "node:fs/promises";
import { getConfig } from "./config.js";
import { createApplication } from "./app.js";
import { importCsv } from "./data/import.js";
const config = getConfig();
try {
  await access(config.catalogPath);
} catch {
  const result = await importCsv("data/BJ-ToiletInfo.csv", config.catalogPath);
  console.log(
    JSON.stringify({
      event: "catalog_imported",
      count: result.report.importedCount,
    }),
  );
}
const { app } = await createApplication(config);
const server = app.listen(config.port, config.host, () =>
  console.log(JSON.stringify({ event: "server_ready", port: config.port })),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
