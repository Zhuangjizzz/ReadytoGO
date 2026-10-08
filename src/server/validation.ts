import { z } from "zod";
import { AppError } from "./errors.js";
export const languageSchema = z.enum(["en", "zh-CN"]);
export const positionSchema = z.object({
  lng: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90),
  crs: z.literal("GCJ02"),
});
export const originSchema = positionSchema.extend({
  label: z.string().trim().min(1).max(200),
  source: z.enum(["manual", "geolocation", "map", "place"]),
  accuracyMeters: z.number().nonnegative().optional(),
});
export const searchSchema = z.object({
  origin: originSchema,
  context: z.enum(["nearby", "plan_stop"]),
  preference: z.enum(["any", "seated_required"]),
  walkLimitMinutes: z.union([z.literal(10), z.literal(20)]),
  includeConditionalAccess: z.boolean(),
  extendedRadiusKm: z.union([z.literal(5), z.literal(10)]),
  language: languageSchema,
  queryVersion: z.number().int().nonnegative(),
  cursor: z.string().max(1000).nullable().optional(),
  retry: z.boolean().optional(),
});
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError(
      "INVALID_INPUT",
      "Some input fields are invalid. Please check your selection.",
      400,
      false,
    );
  return result.data;
}
export function requireBeijing(position: { lng: number; lat: number }) {
  if (
    position.lng < 115.4 ||
    position.lng > 117.6 ||
    position.lat < 39.4 ||
    position.lat > 41.1
  )
    throw new AppError(
      "OUTSIDE_BEIJING",
      "Choose a starting point in Beijing for this demo.",
      422,
      false,
    );
}
