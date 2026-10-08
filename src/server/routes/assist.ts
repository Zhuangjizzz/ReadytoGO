import { Router } from "express";
import { z } from "zod";
import { languageSchema, parse } from "../validation.js";
import type { AiService } from "../ai/service.js";
export function assistRouter(ai: AiService) {
  const router = Router();
  router.post("/assist/parse", async (req, res) => {
    const request = parse(
      z
        .object({
          text: z
            .string()
            .min(1)
            .max(2000)
            .refine((text) => text.trim().length > 0),
          mode: z.literal("itinerary"),
          language: languageSchema,
          preference: z.enum(["any", "seated_required"]),
        })
        .strict(),
      req.body,
    );
    const data = await ai.parse(request);
    res.json({
      requestId: res.locals.requestId,
      data,
      warnings: data.warnings,
    });
  });
  return router;
}
