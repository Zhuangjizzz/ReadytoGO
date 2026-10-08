# Stage 4 AI review

## Service gate

The scoped review of ticket 05 examined structured schemas, exact original-text/order references, duplicate and excess stops, explicit preference evidence, facility/ID validation, protected source facts, deadlines, one repair, caches and sanitized logs. No landmark-specific or test-text production branch was found.

A P2 was reproduced through public HTTP: concurrent stops recalling one POI could publish different identities and facilities after a local-record match; an already exposed ID returned 404. Commit `1a6e27a` re-resolves canonical identity after async matching, preserves the POI alias including cache restoration, and refreshes batches against current source data while retaining each stop's route. The original reproduction and three regressions passed; both stops now return the same matched facility, and the old detail ID returns 200. Ticket 05 was merged at `3d6b440`; 48 default tests, typecheck and build passed at that gate.

An independent six-case real HTTP/model holdout also passed. It covered English seated preference, Chinese negation, no expressed preference, unsupported wheelchair routes, repeated visits, and explicit no preference. Ordered places and time notes were inspected. Responses completed in 2,003–2,742 ms. These are purpose-written verification inputs, with no production prompt changes made in response. The raw result record is `/private/tmp/readytogo-demo-notes/real-parse-holdout-results.json`; delivery will preserve the useful examples in repository documentation.

## Remaining gate

Ticket 06 must still connect editable and confirmable proposals to manual plans, preserve user decisions against late responses, and demonstrate current-language analysis. Service completion alone does not close the full AI experience stage.
