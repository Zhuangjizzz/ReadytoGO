import { Router } from "express";
import { z } from "zod";
import { AppError } from "../errors.js";
import {
  parse,
  positionSchema,
  searchSchema,
  requireBeijing,
} from "../validation.js";
import { validateBeijingOrigin } from "../location.js";
import {
  placeOrigin,
  planRecommendations,
  querySettings,
} from "../../shared/plan.js";
import type { CoreServices } from "./core.js";
import type { PlanStopPreview } from "../../shared/contracts.js";

const placeSchema = z.object({
  provider: z.enum(["amap", "manual"]),
  poiId: z.string().max(200).nullable(),
  nameZh: z.string().trim().min(1).max(200),
  nameEn: z.string().max(300).nullable(),
  addressZh: z.string().max(1000),
  district: z.string().max(100),
  city: z.string().max(100),
  position: positionSchema,
  originType: z.enum(["poi", "map"]),
});
const previewSchema = searchSchema
  .pick({
    language: true,
    preference: true,
    includeConditionalAccess: true,
    walkLimitMinutes: true,
    extendedRadiusKm: true,
  })
  .extend({
    revision: z.number().int().nonnegative(),
    stops: z
      .array(
        z.object({
          stopId: z.string().min(1).max(100),
          place: placeSchema,
          cursor: z.string().max(1000).nullable().optional(),
          retry: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(10)
      .refine(
        (stops) => new Set(stops.map((s) => s.stopId)).size === stops.length,
      ),
  });
export function plansRouter(services: CoreServices) {
  const router = Router();
  router.post("/plans/preview", async (req, res) => {
    const request = parse(previewSchema, req.body);
    for (const stop of request.stops) requireBeijing(stop.place.position);
    const stops = await Promise.all(
      request.stops.map(async (stop): Promise<PlanStopPreview> => {
        try {
          const origin = placeOrigin(stop.place);
          if (origin.source !== "place")
            await validateBeijingOrigin(services.provider, origin);
          const { data, warnings } = await services.query.search({
            ...querySettings(request),
            origin,
            context: "plan_stop",
            queryVersion: request.revision,
            cursor: stop.cursor,
            retry: stop.retry,
          });
          return {
            stopId: stop.stopId,
            result: data,
            ...planRecommendations(data.groups),
            error: null,
            warnings,
          };
        } catch (error) {
          return {
            stopId: stop.stopId,
            result: null,
            primary: null,
            alternatives: [],
            warnings: [],
            error:
              error instanceof AppError
                ? {
                    code: error.code,
                    message: error.message,
                    retryable: error.retryable,
                  }
                : {
                    code: "PREVIEW_UNAVAILABLE",
                    message: "This stop could not be searched. Try again.",
                    retryable: true,
                  },
          };
        }
      }),
    );
    res.json({
      requestId: res.locals.requestId,
      data: {
        revision: request.revision,
        status: stops.some(
          (s) =>
            s.error || s.result?.status === "partial" || s.result?.pendingWork,
        )
          ? "partial"
          : "complete",
        stops,
      },
      warnings: [],
    });
  });
  return router;
}
