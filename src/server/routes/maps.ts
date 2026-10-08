import { Router } from "express";
import { z } from "zod";
import { AppError } from "../errors.js";
import { parse, requireBeijing } from "../validation.js";
import type { AppConfig } from "../config.js";

export function mapsRouter(config: Pick<AppConfig, "amapKey" | "amapBaseUrl">) {
  const router = Router();
  const cache = new Map<string, { until: number; image: Buffer }>();
  const pending = new Map<string, Promise<Buffer>>();
  const unavailable = () =>
    new AppError(
      "MAP_UNAVAILABLE",
      "The map image is unavailable. You can continue using the list.",
      503,
      true,
    );
  router.get("/maps/static", async (req, res) => {
    const args = parse(
      z
        .object({
          lng: z.coerce.number().finite().min(-180).max(180),
          lat: z.coerce.number().finite().min(-90).max(90),
          zoom: z.coerce.number().int().min(3).max(17).default(14),
          width: z.coerce.number().int().min(200).max(1024).default(640),
          height: z.coerce.number().int().min(200).max(1024).default(480),
        })
        .strict(),
      req.query,
    );
    requireBeijing(args);
    if (!config.amapKey)
      throw new AppError(
        "MAP_NOT_CONFIGURED",
        "Map service is not configured. You can continue using the list.",
        503,
        true,
      );
    const key = JSON.stringify(args);
    for (const [k, value] of cache)
      if (value.until < Date.now()) cache.delete(k);
    let image = cache.get(key)?.image;
    if (!image) {
      let request = pending.get(key);
      if (!request) {
        if (pending.size >= 8)
          throw new AppError(
            "MAP_BUSY",
            "The map is busy. Please retry.",
            503,
            true,
          );
        request = (async () => {
          // The upstream is server configuration, never a user-provided URL or path.
          const url = new URL("/v3/staticmap", config.amapBaseUrl);
          url.search = new URLSearchParams({
            key: config.amapKey,
            location: `${args.lng.toFixed(6)},${args.lat.toFixed(6)}`,
            zoom: String(args.zoom),
            size: `${args.width}*${args.height}`,
            scale: "1",
          }).toString();
          try {
            const response = await fetch(url, {
              signal: AbortSignal.timeout(7000),
              redirect: "error",
            });
            if (
              !response.ok ||
              !response.headers.get("content-type")?.startsWith("image/png")
            )
              throw unavailable();
            const bytes = Buffer.from(await response.arrayBuffer());
            if (
              bytes.length > 3_000_000 ||
              bytes.length < 24 ||
              !bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            )
              throw unavailable();
            if (cache.size >= 40) cache.delete(cache.keys().next().value!);
            cache.set(key, { image: bytes, until: Date.now() + 5 * 60_000 });
            return bytes;
          } catch {
            throw unavailable();
          } finally {
            pending.delete(key);
          }
        })();
        pending.set(key, request);
      }
      image = await request;
    }
    res
      .set({
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      })
      .send(image);
  });
  return router;
}
