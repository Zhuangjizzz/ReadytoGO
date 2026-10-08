import type { Position } from "../shared/contracts.js";
import { AppError } from "./errors.js";
import type { AmapProvider, ResolvedLocation } from "./providers/amap.js";
import { requireBeijing } from "./validation.js";
const caches = new WeakMap<
  AmapProvider,
  Map<string, { until: number; result: ResolvedLocation }>
>();
export async function validateBeijingOrigin(
  provider: AmapProvider,
  position: Position,
): Promise<ResolvedLocation> {
  requireBeijing(position);
  if (!provider.reverseGeocode)
    throw new AppError(
      "MAP_UNAVAILABLE",
      "This location could not be confirmed. Please retry or search for a place.",
      503,
      true,
    );
  let cache = caches.get(provider);
  if (!cache) {
    cache = new Map();
    caches.set(provider, cache);
  }
  const key = `${position.lng.toFixed(6)},${position.lat.toFixed(6)}`;
  const cached = cache.get(key);
  const result =
    cached && cached.until > Date.now()
      ? cached.result
      : await provider.reverseGeocode(position);
  if (!/^\d{6}$/.test(result.adcode))
    throw new AppError(
      "MAP_UNAVAILABLE",
      "This location could not be confirmed. Please retry or search for a place.",
      503,
      true,
    );
  if (!result.adcode.startsWith("11"))
    throw new AppError(
      "OUTSIDE_BEIJING",
      "Choose a starting point in Beijing for this demo.",
      422,
      false,
    );
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(key, { result, until: Date.now() + 15 * 60_000 });
  return result;
}
