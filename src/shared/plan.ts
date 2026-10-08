import type {
  Candidate,
  CandidateGroups,
  Origin,
  Place,
  QuerySettings,
} from "./contracts.js";

export function placeOrigin(place: Place): Origin {
  return {
    ...place.position,
    label: place.nameZh,
    source: place.originType === "poi" ? "place" : place.originType,
  };
}
export function querySettings(value: QuerySettings): QuerySettings {
  return {
    language: value.language,
    preference: value.preference,
    includeConditionalAccess: value.includeConditionalAccess,
    walkLimitMinutes: value.walkLimitMinutes,
    extendedRadiusKm: value.extendedRadiusKm,
  };
}
export function planRecommendations(groups: CandidateGroups) {
  const primary = groups.matched[0] ?? null;
  const alternatives = [...groups.matched.slice(1), ...groups.farther].slice(
    0,
    2,
  );
  return { primary, alternatives };
}
export function sameToilet(candidate: Candidate, id: string) {
  return (
    candidate.toiletId === id ||
    candidate.sources.some(
      (source) => source.provider === "amap" && id === `amap_${source.poiId}`,
    )
  );
}
