import express from "express";
import { AiService } from "./ai/service.js";
import { QwenModel, type JsonModel } from "./providers/qwen.js";
import { assistRouter } from "./routes/assist.js";
import { plansRouter } from "./routes/plans.js";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getConfig, type AppConfig } from "./config.js";
import { AppError } from "./errors.js";
import { Catalog } from "./data/catalog.js";
import { QueryService, type QueryOptions } from "./query.js";
import { AmapHttpProvider, type AmapProvider } from "./providers/amap.js";
import { coreRouter, type CoreServices } from "./routes/core.js";
import { mapsRouter } from "./routes/maps.js";
import { navigationRouter } from "./routes/navigation.js";
import type { CatalogFile } from "../shared/contracts.js";
export interface RequestLog {
  event: "http_request";
  requestId: string;
  method: string;
  route: string;
  status: number;
  durationMs: number;
  errorCode?: string;
}
export interface ApplicationOptions extends Partial<AppConfig> {
  provider?: AmapProvider;
  model?: JsonModel;
  logger?: (entry: RequestLog) => void;
  now?: () => Date;
  queryOptions?: QueryOptions;
  registerRoutes?: (app: express.Express, services: CoreServices) => void;
}
export async function createApplication(options: ApplicationOptions = {}) {
  const config = { ...getConfig(), ...options };
  const catalog = new Catalog(
    JSON.parse(await readFile(config.catalogPath, "utf8")) as CatalogFile,
    config.matchCachePath,
  );
  await catalog.loadMatches();
  const provider =
    options.provider ??
    new AmapHttpProvider({ key: config.amapKey, baseUrl: config.amapBaseUrl });
  const query = new QueryService(
    catalog,
    provider,
    options.now,
    options.queryOptions,
  );
  const ai = new AiService(
    options.model ??
      new QwenModel({
        key: config.qwenKey,
        baseUrl: config.qwenBaseUrl,
        model: config.qwenModel,
        timeoutMs: Math.max(config.aiTimeoutMs, config.aiAnalysisTimeoutMs),
      }),
    config.aiTimeoutMs,
    config.aiAnalysisTimeoutMs,
  );
  query.setCandidateAnalyzer((candidates, request) =>
    ai.analyzeCandidates(candidates, request),
  );
  if (options.model || (config.qwenKey && config.qwenModel)) {
    catalog.setMatchAssistant((poi, records) => ai.matchRecord(poi, records));
  }
  const services = { catalog, provider, query, ai };

  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    const started = performance.now();
    res.on("finish", () => {
      const log: RequestLog = {
        event: "http_request",
        requestId: res.locals.requestId,
        method: req.method,
        route:
          typeof req.route?.path === "string" ? req.route.path : "unmatched",
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
        ...(res.locals.errorCode ? { errorCode: res.locals.errorCode } : {}),
      };
      if (options.logger) options.logger(log);
      else console.info(JSON.stringify(log));
    });
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      service: "readytogo",
      catalogCount: catalog.toilets.size,
    }),
  );
  app.use("/api/v1", coreRouter(services));
  app.use("/api/v1", navigationRouter(services));
  app.use("/api/v1", mapsRouter(config));
  app.use("/api/v1", assistRouter(ai));
  app.use("/api/v1", plansRouter(services));
  options.registerRoutes?.(app, services);
  app.use("/api", (_req, _res, next) =>
    next(new AppError("NOT_FOUND", "This endpoint was not found.", 404)),
  );
  app.use(express.static(config.clientPath));
  app.get("/{*path}", (_req, res, next) => {
    res.sendFile("index.html", { root: config.clientPath }, (error) => {
      if (error)
        next(
          new AppError(
            "APP_NOT_BUILT",
            "Build the web app with npm run build.",
            404,
          ),
        );
    });
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const known = error instanceof AppError;
      const jsonError = error instanceof SyntaxError;
      res.locals.errorCode = known
        ? error.code
        : jsonError
          ? "INVALID_JSON"
          : "INTERNAL_ERROR";
      res.status(known ? error.status : jsonError ? 400 : 500).json({
        requestId: res.locals.requestId,
        error: {
          code: known
            ? error.code
            : jsonError
              ? "INVALID_JSON"
              : "INTERNAL_ERROR",
          message: known
            ? error.message
            : jsonError
              ? "The request body is not valid JSON."
              : "The request could not be completed.",
          retryable: known ? error.retryable : !jsonError,
        },
      });
    },
  );
  return { app, services, config };
}
