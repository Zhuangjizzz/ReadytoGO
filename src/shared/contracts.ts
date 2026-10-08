export type Language = "en" | "zh-CN";
export type Preference = "any" | "seated_required";
export type SeatStatus = "documented" | "inferred" | "unknown" | "unavailable";
export type AccessCondition =
  "public" | "ticket_required" | "purchase_required" | "restricted" | "unknown";
export type OpeningStatus = "expected_open" | "expected_closed" | "unknown";
export type RouteStatus =
  "success" | "unreachable" | "provider_error" | "pending";
export type QueryContext = "nearby" | "plan_stop";
export interface Position {
  lng: number;
  lat: number;
  crs: "GCJ02";
}
export interface SourcePosition {
  lng: number;
  lat: number;
  crs: "unknown";
}
export interface Origin extends Position {
  label: string;
  source: "manual" | "geolocation" | "map" | "place";
  accuracyMeters?: number;
}
export interface Place {
  provider: "amap" | "manual";
  poiId: string | null;
  nameZh: string;
  nameEn: string | null;
  addressZh: string;
  district: string;
  city: string;
  position: Position;
  originType: "poi" | "map" | "geolocation";
}
export interface Source {
  provider: "beijing_csv" | "amap";
  name: string;
  fileName?: string;
  rowNumber?: number;
  poiId?: string;
  governmentId?: string | null;
  rawFields: Record<string, string | number | null>;
}
export interface Facilities {
  maleStalls: number | null;
  femaleStalls: number | null;
  unisexStalls: number | null;
  thirdRestroom: number | boolean | null;
  accessibility: boolean | null;
  accessibleRoom: number | boolean | null;
  allAccessible: boolean | null;
  accessibleStalls: number | boolean | null;
  managementRoom: boolean | null;
  washroom: boolean | null;
  adultSeated: boolean | null;
  childSeatedOnly: boolean | null;
  notes: string | null;
}
export interface Toilet {
  id: string;
  nameZh: string;
  nameEn: string | null;
  addressZh: string;
  district: string;
  position: Position | null;
  sourcePosition: SourcePosition | null;
  positionSource: string | null;
  poiId: string | null;
  matchMethod: "poi_id" | "name_address" | "name_distance" | null;
  facilities: Facilities;
  seatStatus: SeatStatus;
  seatBasis: string[];
  openingHoursRaw: string | null;
  accessCondition: AccessCondition;
  accessNote: string | null;
  availability: "active" | "permanently_closed" | "unknown";
  sources: Source[];
}
export interface Route {
  origin: Position;
  destination: Position;
  status: RouteStatus;
  walkSeconds: number | null;
  walkMeters: number | null;
}
export type GroupName =
  "matched" | "farther" | "otherNearby" | "conditionalAccess" | "routeUnknown";
export interface Candidate {
  toiletId: string;
  nameZh: string;
  nameEn: string | null;
  addressZh: string;
  district: string;
  position: Position | null;
  seatStatus: SeatStatus;
  seatBasis: string[];
  facilities: Facilities;
  openingStatus: OpeningStatus;
  openingHoursRaw: string | null;
  accessCondition: AccessCondition;
  accessNote: string | null;
  routeStatus: RouteStatus;
  walkSeconds: number | null;
  walkMeters: number | null;
  straightLineMeters: number | null;
  reason: string;
  sources: Source[];
  baseGroup?: Exclude<GroupName, "conditionalAccess">;
  ordinaryAlternative?: boolean;
}
export type CandidateGroups = Record<GroupName, Candidate[]>;
export interface SearchRequest {
  origin: Origin;
  context: QueryContext;
  preference: Preference;
  walkLimitMinutes: 10 | 20;
  includeConditionalAccess: boolean;
  extendedRadiusKm: 5 | 10;
  language: Language;
  queryVersion: number;
  cursor?: string | null;
  retry?: boolean;
}
export interface SearchResult {
  status: "complete" | "empty" | "partial";
  queryVersion: number;
  origin: Origin;
  groups: CandidateGroups;
  analysisStatus: "pending" | "complete" | "fallback";
  summary: string;
  pendingWork: boolean;
  hasMore: boolean;
  nextCursor: string | null;
}
export interface ApiSuccess<T> {
  requestId: string;
  data: T;
  warnings: string[];
}
export interface ApiFailure {
  requestId: string;
  error: { code: string; message: string; retryable: boolean };
}
export interface PlanStop {
  stopId: string;
  place: Place;
  note?: string;
  selectedToiletId?: string | null;
  skipped?: boolean;
}
export interface PlanLocal {
  schemaVersion: 1;
  language: Language;
  preference: Preference;
  includeConditionalAccess: boolean;
  walkLimitMinutes: 10 | 20;
  extendedRadiusKm: 5 | 10;
  revision: number;
  stops: PlanStop[];
  updatedAt: string;
}
export interface ImportReport {
  inputFile: string;
  inputRecords: number;
  importedCount: number;
  mergedCount: number;
  skippedCount: number;
  parsedPositionCount: number;
  usablePositionCount: number;
  anomalies: Record<string, number>;
  sampleToiletIds: string[];
}
export interface CatalogFile {
  schemaVersion: 1;
  report: ImportReport;
  toilets: Toilet[];
}
