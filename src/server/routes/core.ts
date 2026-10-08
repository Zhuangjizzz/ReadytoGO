import { Router } from "express";
import { z } from "zod";
import { validateBeijingOrigin } from "../location.js";
import { AppError } from "../errors.js";
import {
  languageSchema,
  parse,
  requireBeijing,
  searchSchema,
} from "../validation.js";
import type { Catalog } from "../data/catalog.js";
import type { QueryService } from "../query.js";
import type { AmapProvider } from "../providers/amap.js";
import type { Place } from "../../shared/contracts.js";
export interface CoreServices {
  catalog: Catalog;
  query: QueryService;
  provider: AmapProvider;
}
export function coreRouter(services: CoreServices) {
  const router = Router();
  router.get("/data/summary", (_req, res) =>
    res.json({
      requestId: res.locals.requestId,
      data: services.catalog.file.report,
      warnings: [],
    }),
  );
  router.get("/places/search", async (req, res) => {
    const args = parse(
      z.object({
        q: z.string().trim().min(1).max(120),
        language: languageSchema.default("en"),
        city: z.literal("beijing").default("beijing"),
      }),
      req.query,
    );
    const result = await services.provider.searchPlaces(args.q);
    const places: Place[] = result.pois.map((p) => ({
      provider: "amap",
      poiId: p.id,
      nameZh: p.name,
      nameEn: null,
      addressZh: p.address,
      district: p.district,
      city: p.city,
      position: p.position,
      originType: "poi",
    }));
    res.json({
      requestId: res.locals.requestId,
      data: { places, hasMore: result.hasMore },
      warnings: [],
    });
  });
  router.post("/toilets/search", async (req, res) => {
    const args = parse(searchSchema, req.body);
    requireBeijing(args.origin);
    if (args.origin.source !== "place")
      await validateBeijingOrigin(services.provider, args.origin);
    const result = await services.query.search(args);
    res.json({ requestId: res.locals.requestId, ...result });
  });
  router.get("/toilets/:id", (req, res) => {
    const toilet = services.catalog.get(String(req.params.id));
    if (!toilet)
      throw new AppError("NOT_FOUND", "Toilet not found.", 404, false);
    res.json({ requestId: res.locals.requestId, data: toilet, warnings: [] });
  });
  return router;
}
