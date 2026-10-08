# Stage 4 AI review

## Service gate

The scoped review of ticket 05 examined structured schemas, exact original-text/order references, duplicate and excess stops, explicit preference evidence, facility/ID validation, protected source facts, deadlines, one repair, caches and sanitized logs. No landmark-specific or test-text production branch was found.

A P2 was reproduced through public HTTP: concurrent stops recalling one POI could publish different identities and facilities after a local-record match; an already exposed ID returned 404. Commit `1a6e27a` re-resolves canonical identity after async matching, preserves the POI alias including cache restoration, and refreshes batches against current source data while retaining each stop's route. The original reproduction and three regressions passed; both stops now return the same matched facility, and the old detail ID returns 200. Ticket 05 was merged at `3d6b440`; 48 default tests, typecheck and build passed at that gate.

An independent six-case real HTTP/model holdout also passed. It covered English seated preference, Chinese negation, no expressed preference, unsupported wheelchair routes, repeated visits, and explicit no preference. Ordered places and time notes were inspected. Responses completed in 2,003–2,742 ms. These are purpose-written verification inputs, with no production prompt changes made in response. The raw result record is `/private/tmp/readytogo-demo-notes/real-parse-holdout-results.json`; delivery will preserve the useful examples in repository documentation.

## Generic repair improvement

A subsequent bounded real three-stop preview completed the initial batch at each stop with real routes in 30.6–33.9 seconds. All three retained `hasMore=true`; later batches were not part of this probe. Two stops completed AI analysis and one used rule fallback. A single instrumented follow-up reproduced an invalid-field response followed by the shared deadline during its sole repair. This identifies the reproduced failure, not conclusively the earlier uninstrumented cause.

Commit `82f3b18`, merged at `3b0be4d`, makes facility basis fields an explicit finite enum and supplies bounded structured issues plus the rejected JSON for the single repair. All contextual source/ID/positive-evidence checks remain; deadlines and retry counts are unchanged. Independent review found no P1/P2 and 21 AI HTTP tests passed; the integrated suite was 78 tests. One final real ten-candidate check passed first-attempt validation, with analysis 11.49 seconds and total query 20.54 seconds. No place-specific prompt, guessed field alias, extra retry or enlarged deadline was introduced.

## Experience gate resolution

Ticket 06 at `5cc9198` was merged at `fcec886`. Its proposal state is independent of the saved plan; only explicit confirmation replaces 1–10 selected real places. Ambiguous, unmatched, repeated and excess stops remain editable. Null preference preserves the current choice; unsupported needs remain explanatory text. Original-input changes require reparsing or explicit manual-draft adoption before confirmation.

The scoped review closed two stale-request issues in PlacePicker and automatic matching batches. It also checked explicit manual continuation after a changed input fails parsing, and clearing drafts together with the plan. Thirteen HTTP/isolated DOM tests passed independently, including a replay containing existing real model/map output for three stops and nine initial cards. Explicit correspondence assertions cover the three selected POIs and three primary cards' IDs, reasons and sources. The full suite at this gate is 91 tests with successful typecheck/build. Normal parse quality, real batch analysis, safe repair/fallback and UI field correspondence all have separate evidence; no production fixture branch was added.

Actual-application browser preview and actual-phone acceptance remain unperformed under the recorded access limitation; isolated DOM replay is not represented as either.
