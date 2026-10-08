# Stage 2 rule/batch review — 2026-10-09

Pre-merge scoped review of `codex/demo-02-nearby-rules` at `efce11ae8a01efc11ab3c1161176516308ca08e5`, integration base `f9d4d5daf3db62c172dc1e3986f743e3a689f491`. Reviewed five groups, explicit facility evidence/conflict behavior, pagination after 60, pending/retry/cursor semantics, provider admission/parallelism and related HTTP tests. UI/map/navigation wiring assigned to 03 is excluded. No Browser Use or live application preview was performed.

## Merge blockers

- **P2 — negated entry requirements become affirmative restrictions.** `src/server/rules.ts:110–121` matches `需门票` inside `无需门票` and `需要消费` inside `不需要消费`. Through the public HTTP search with boundary fixtures, `无需门票，游客可用` appears in `conditionalAccess` with `ticket_required`, and `不需要消费` appears there with `purchase_required`. Interpret clause polarity before assigning a required condition; do not turn a negative requirement into an affirmative one.
- **P2 — explicitly unusable facilities remain recommendations.** `src/server/rules.ts:132` recognizes only permanent closure/withdrawal/demolition wording. The actual CSV has multiple `已停用`/`停用` notes while the status column is `现有`. Public HTTP search of an active imported record with `已停用` returns it in `matched`. Exclude clear unusable status without claiming a temporary closure is permanent; preserve contrary statements such as not stopped/already reopened.

The HTTP reproductions returned: `已停用 → matched/unknown`; `无需门票，游客可用 → conditionalAccess/ticket_required`; `不需要消费 → conditionalAccess/purchase_required`.

The code paths for raw-second grouping, ordinary-alternative visibility, cursor-bound conditions, retaining successful routes during retry, and continuing past 60 have been inspected without an additional actionable finding in this scoped pass. Root informed; no merge and no implementation changes performed.

## Recommendation gate resolution

The access-negation and out-of-service findings were fixed by `8b10a48` and independently reproduced as passing before merge `1cce442`. npm test 29/29, typecheck and build passed. Full stage 2 also requires ticket 03 integration.
