# Stage 1 review — 2026-10-09

Reviewed the uncommitted data/API implementation in `/Users/bytedance/.codex/worktrees/demo-data-nearby/ReadytoGo`, based on `8cce9f0`. UI was being completed and was excluded. Requirements: `.scratch/demo-development/spec.md`, issue 01, `docs/prd/data-and-api.md`, and `docs/prd/rules.md`.

## Standards

1. **P2 — cache overwrites current imported facts.** `src/server/data/catalog.ts:11,27` stores complete `Toilet` objects and replaces current CSV objects when loading matches. A repeat import with the same position/name/address keeps the ID but changes a facility: fresh catalog `thirdRestroom=0`; after restart with the old match cache the public detail response returns `thirdRestroom=1` and old raw source `"1"`. This was reproduced through the formal import command and public HTTP search/detail endpoints. Cache only the association/provider fields for local entities and merge them onto current imported facts; store standalone Amap entities separately. Spec requires an independent matching cache and separation of raw facilities from derived information.
2. **P2 — request diagnostics absent.** `src/server/app.ts:17–24` generates response IDs at response/error time but emits no request/error diagnostic records. `docs/prd/data-and-api.md` requires request ID, elapsed time and error logs. Generate one request ID at entry, reuse it in response and redacted logs; record route template/status/error code/elapsed time, excluding raw URL parameters, body, coordinates and secrets.

No test-specific production branches, secret logs or precise-location logs were observed. The committed test style uses the public HTTP/formal import interfaces and provider substitution.

## Spec

1. **P2 — malformed walking payload becomes an empty successful search.** `src/server/providers/amap.ts:32` maps absent or non-array `route.paths` to `unreachable`. With the actual HTTP adapter and a local upstream returning a valid POI and `{status:"1",route:{}}`, `POST /api/v1/toilets/search` returns HTTP 200, `status=empty`, all groups empty and no warning. A malformed upstream result must become `provider_error`/`routeUnknown`; reserve `unreachable` for a structurally valid empty path result. Add an HTTP-adapter boundary regression.

## Stage 2 handoff (already in issue 02 scope)

- `src/server/query.ts:28,55` truncates recall at 60 then computes `hasMore` only from that truncated array. The last batch reports `false/null` even if candidates were discarded. Spec requires a user-driven next bounded window after 60 while candidates remain.
- Actual CSV notes contain closures, explicit adult seated details and child seated details. Stage 2 must include notes in the availability/facility interpretation; importer presently preserves them but does not interpret them.

## Checks

- `npm test`: 3 passed.
- `npm run check`: passed.
- Actual GB18030 CSV headers and columns 15–26 agree with the importer mapping; zero/missing and adjacent facility meanings are preserved.
- Imported coordinates retain `crs=unknown` and do not become navigation coordinates until matched; walking values use seconds/meters and failed values are null.
- No implementation files changed and no merge performed.

## Recheck of 99b6637

The three findings above are repaired in implementation commit `6a12513` (branch head `99b6637`, with current integration base `dda2d9e` merged in). Seven tests and typecheck passed in this worktree. Cache restores only location/provider data for local entities; malformed walking schema is now `provider_error`; public responses and redacted request logs share an ID.

**New merge blocker — address numbers are not token-safe.** `src/server/data/catalog.ts:159–172` added `preciseAddress` matching. Normalization removes the Chinese `号` suffix, so `北京市东城区园路1号` is a substring of `北京市东城区园路10号`. A generic `公共厕所` POI at the latter address, over 800m from the local record, becomes the local `园路东口公厕` at number 1 and inherits its `inferred` seated facilities. Reproduced through the formal CSV importer and public HTTP search with provider substitution. Address containment must reject conflicting house-number tokens; unresolved or conflicting cases must remain independent candidates. Root informed; no merge performed.

## Final stage 1 merge

Address repair `83744fced935626ab761e4579357e2666a53e45c` passes the original formal-import/HTTP reproduction: number 10 remains an independent provider POI, has unknown facilities, and does not inherit number 1's source. The repair compares complete door-number and road tokens, rejects conflicting source positions, allows entrance suffix text, and expires older matching rules with cache version 2.

Merged using `--no-ff` to `codex/demo-integration` at **`307a2506c704f08c955627bbbf08ca83850113c3`**. In `/Users/bytedance/Desktop/ReadytoGo`, `npm ci`, all **15 tests**, `npm run check`, and `npm run build` passed. Existing unrelated untracked files remained unchanged, with no tracked working-tree edits. No deployment or additional real API calls were performed. Stage 1 merge released to root for subsequent tickets.

## Gate resolution

All original findings and the address-prefix regression were independently verified fixed before merge. Integration commit: `307a250`. npm test 15/15, npm run check, npm run build passed. Stage 2 pagination and full facility interpretation remain within ticket 02.
