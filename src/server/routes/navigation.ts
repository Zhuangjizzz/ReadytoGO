import { Router } from "express";
import { z } from "zod";
import type { NavigationResult } from "../../shared/navigation.js";
import { validateBeijingOrigin } from "../location.js";
import { AppError } from "../errors.js";
import {
  languageSchema,
  originSchema,
  positionSchema,
  parse,
  requireBeijing,
} from "../validation.js";
import type { CoreServices } from "./core.js";

export function navigationRouter(services: CoreServices) {
  const router = Router();
  router.post("/navigation/link", async (req, res) => {
    const args = parse(
      z.object({
        toiletId: z.string().min(1).max(200),
        origin: originSchema.nullable().optional(),
        language: languageSchema.default("en"),
        retry: z.boolean().optional(),
      }),
      req.body,
    );
    const toilet = services.catalog.get(args.toiletId);
    if (!toilet)
      throw new AppError("NOT_FOUND", "Toilet not found.", 404, false);
    let originConfirmed = true;
    if (args.origin) {
      requireBeijing(args.origin);
      if (args.origin.source !== "place") {
        try {
          await validateBeijingOrigin(services.provider, args.origin);
        } catch (error) {
          if (error instanceof AppError && error.code === "OUTSIDE_BEIJING")
            throw error;
          // A provider outage must not remove valid-coordinate handoff links.
          originConfirmed = false;
        }
      }
    }
    const searchUrl = new URL("https://uri.amap.com/search");
    searchUrl.search = new URLSearchParams({
      keyword: [toilet.nameZh, toilet.addressZh].filter(Boolean).join(" "),
      city: "北京市",
      src: "ReadytoGo",
      callnative: "0",
    }).toString();
    const data: NavigationResult = {
      origin: args.origin ?? null,
      destination: toilet.position,
      appUrl: null,
      webUrl: null,
      searchUrl: searchUrl.toString(),
      copyText: [toilet.nameZh, toilet.addressZh].filter(Boolean).join("\n"),
      routeStatus: "provider_error",
      walkSeconds: null,
      walkMeters: null,
    };
    if (args.origin && toilet.position) {
      const coordinate = (p: { lng: number; lat: number }, name: string) =>
        `${p.lng.toFixed(6)},${p.lat.toFixed(6)},${name}`;
      const web = new URL("https://uri.amap.com/navigation");
      web.search = new URLSearchParams({
        from: coordinate(args.origin, args.origin.label),
        to: coordinate(toilet.position, toilet.nameZh),
        mode: "walk",
        src: "ReadytoGo",
        callnative: "0",
      }).toString();
      data.webUrl = web.toString();
      web.searchParams.set("callnative", "1");
      data.appUrl = web.toString();
      const route = originConfirmed
        ? await services.query.route(args.origin, toilet.position, args.retry)
        : {
            status: "provider_error" as const,
            walkSeconds: null,
            walkMeters: null,
          };
      data.routeStatus = route.status;
      if (route.status === "success") {
        data.walkSeconds = route.walkSeconds;
        data.walkMeters = route.walkMeters;
      }
    }
    res.json({ requestId: res.locals.requestId, data, warnings: [] });
  });
  router.post("/location/convert", async (req, res) => {
    const args = parse(
      z.object({
        lng: z.number().finite().min(-180).max(180),
        lat: z.number().finite().min(-90).max(90),
        crs: z.literal("WGS84"),
        accuracyMeters: z.number().finite().nonnegative().optional(),
        language: languageSchema.default("en"),
      }),
      req.body,
    );
    requireBeijing(args);
    const position = await services.provider.convertGps(args);
    await validateBeijingOrigin(services.provider, position);
    const approximate = (args.accuracyMeters ?? 0) > 150;
    const label =
      args.language === "zh-CN"
        ? approximate
          ? "大致当前位置"
          : "当前位置"
        : approximate
          ? "Approximate current location"
          : "Current location";
    res.json({
      requestId: res.locals.requestId,
      data: {
        ...position,
        label,
        source: "geolocation",
        ...(args.accuracyMeters !== undefined
          ? { accuracyMeters: args.accuracyMeters }
          : {}),
      },
      warnings: [],
    });
  });
  router.post("/location/resolve", async (req, res) => {
    const args = parse(
      positionSchema.extend({ language: languageSchema.default("en") }),
      req.body,
    );
    const region = await validateBeijingOrigin(services.provider, args);
    const label =
      args.language === "zh-CN" ? "地图所选位置" : "Selected map point";
    res.json({
      requestId: res.locals.requestId,
      data: {
        provider: "manual",
        poiId: null,
        nameZh: region.address || "地图所选位置",
        nameEn: label,
        addressZh: region.address,
        district: region.district,
        city: region.city,
        position: { lng: args.lng, lat: args.lat, crs: "GCJ02" },
        originType: "map",
      },
      warnings: [],
    });
  });
  return router;
}
