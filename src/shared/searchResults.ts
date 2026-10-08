import type { Candidate, CandidateGroups, SearchResult } from "./contracts.js";
import { sameToilet } from "./plan.js";

export function mergeSearchPages(
  pages: ReadonlyMap<string, SearchResult>,
  latest: SearchResult,
): SearchResult {
  const groups: CandidateGroups = {
    matched: [],
    farther: [],
    otherNearby: [],
    conditionalAccess: [],
    routeUnknown: [],
  };
  const items = new Map<
    string,
    { group: keyof CandidateGroups; candidate: Candidate }
  >();
  for (const page of pages.values())
    for (const group of Object.keys(groups) as (keyof CandidateGroups)[])
      for (const candidate of page.groups[group]) {
        for (const [id, value] of items)
          if (
            sameToilet(candidate, id) ||
            sameToilet(value.candidate, candidate.toiletId)
          )
            items.delete(id);
        items.set(candidate.toiletId, { group, candidate });
      }
  for (const { group, candidate } of items.values())
    groups[group].push(candidate);
  for (const list of Object.values(groups))
    list.sort((a, b) =>
      a.routeStatus === "success" && b.routeStatus === "success"
        ? (a.walkSeconds ?? Infinity) - (b.walkSeconds ?? Infinity) ||
          (a.walkMeters ?? Infinity) - (b.walkMeters ?? Infinity) ||
          a.toiletId.localeCompare(b.toiletId)
        : (a.straightLineMeters ?? Infinity) -
            (b.straightLineMeters ?? Infinity) ||
          a.toiletId.localeCompare(b.toiletId),
    );
  return {
    ...latest,
    groups,
    status: [...pages.values()].some((p) => p.status === "partial")
      ? "partial"
      : items.size
        ? "complete"
        : latest.status,
  };
}
