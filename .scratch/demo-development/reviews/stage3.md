# Stage 3 planning review

Reviewed ticket 04 at `69c1a8a` before merge `0c14301`: stable stop identity, revision/calculation-key separation, preserving batch cursors during reorder, single-stop replacement/retry, user selection and skip protection, canonical aliases, full-list planning context, ordinary-candidate expansion, shared settings and local persistence.

No new P1/P2 was found in this scoped review. Four public HTTP tests and ten isolated DOM tests were independently run and passed. They cover in-flight reorder without duplicate routes, partial stop failure, late analysis preserving user decisions, alias migration, clearing pending work, replacing a stop, storage failures/unknown versions, and excluding GPS from persistent state. Full implementation validation was 73 default tests plus typecheck/build.

Root caught a public-HTTP compatibility issue during implementation: relying only on `crypto.randomUUID()` could prevent creating a stop outside a secure context. The shared client ID helper now has a generic `getRandomValues` fallback; the UI regression removes `randomUUID` and verifies repeated additions and stable IDs. The behavior is based on MDN's Crypto documentation, recorded in `/private/tmp/readytogo-demo-notes/http-browser-compatibility.md`, not on any fixed itinerary text.

The current plan is stored separately from transient query results. Global conditions and language have one owner; clearing invalidates pending results. A selected candidate missing from the first page is retained for rechecking rather than prematurely erased. The AI proposal workflow is intentionally left to ticket 06.

No actual-application browser preview or actual-phone acceptance was performed. The existing verification limitations remain unchanged.
