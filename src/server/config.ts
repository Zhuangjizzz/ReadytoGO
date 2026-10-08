import { resolve } from "node:path";
export const limits = {
  providerTimeoutMs: 5000,
  batchTimeoutMs: 120000,
  providerQueueTimeoutMs: 90000,
  firstResponseWaitMs: 150,
  routeCacheMs: 15 * 60_000,
  queryCacheMs: 15 * 60_000,
  routeBatchSize: 10,
  maxCandidates: 60,
  providerConcurrency: 5,
  providerStartIntervalMs: 500,
  ordinaryRadiusMeters: { 10: 2000, 20: 3000 },
} as const;
export interface AppConfig {
  catalogPath: string;
  matchCachePath: string | null;
  amapKey: string;
  amapBaseUrl: string;
  qwenKey: string;
  qwenBaseUrl: string;
  qwenModel: string;
  aiTimeoutMs: number;
  port: number;
  clientPath: string;
}
export function getConfig(): AppConfig {
  return {
    catalogPath: resolve(
      process.env.CATALOG_PATH || "data/generated/catalog.json",
    ),
    matchCachePath:
      process.env.MATCH_CACHE_PATH === ""
        ? null
        : resolve(
            process.env.MATCH_CACHE_PATH || "data/generated/matches.json",
          ),
    amapKey: process.env.AMAP_KEY || process.env.AMAP_WEBSERVICE_KEY || "",
    amapBaseUrl: "https://restapi.amap.com",
    qwenKey: process.env.DASHSCOPE_API_KEY || "",
    qwenBaseUrl:
      process.env.QWEN_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    qwenModel: process.env.QWEN_MODEL || "",
    aiTimeoutMs: 12000,
    port: Number(process.env.PORT || 3001),
    clientPath: resolve("dist/client"),
  };
}
