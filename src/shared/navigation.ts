import type { Origin, Position, RouteStatus } from "./contracts.js";
export interface NavigationResult {
  origin: Origin | null;
  destination: Position | null;
  appUrl: string | null;
  webUrl: string | null;
  searchUrl: string;
  copyText: string;
  routeStatus: RouteStatus;
  walkSeconds: number | null;
  walkMeters: number | null;
}
