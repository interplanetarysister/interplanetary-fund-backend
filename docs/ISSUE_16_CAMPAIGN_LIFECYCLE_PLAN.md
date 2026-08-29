# Issue #16 — Campaign Lifecycle Safety Plan

## Status
Planning only. This document is not implementation or runtime proof. The existing lifecycle PR (#52) is stale against current `main` and must not be treated as publication evidence.

## Goal
Make terminal campaign lifecycle propagation and 30-day linked-post retention deterministic, resumable, and safe alongside concurrent automation writers.

## Current-main assessment
The stale implementation in PR #52 introduces a daily internal mutation that scans all campaigns and linked records, patches terminal listing state, keeps `paymentActive` enabled, stamps `deletedAt`, and deletes `distributedPosts`/`facebookGroupPosts` after 30 days. That broad scan performs writes directly in the cron mutation and can overlap with the automation/publishing writers implicated in the P0 Convex contention investigation. It also has no durable per-campaign claim, bounded work unit, or explicit deletion idempotency/recovery state.

## Proposed implementation sequence
1. Rebuild from the exact current `main` SHA; do not rebase the stale PR blindly.
2. Preserve the existing schema/source-of-truth contracts and inspect `distributedPosts`/`facebookGroupPosts` indexes before changing fields.
3. Split lifecycle discovery from per-campaign work so the cron only claims bounded jobs rather than mutating an unbounded set in one transaction.
4. Add an explicit, conditional campaign lifecycle claim/state boundary so concurrent cron/manual automation cannot process the same campaign simultaneously.
5. Make terminal listing propagation idempotent: repeated runs converge on the same state and do not rewrite unchanged records.
6. Represent deletion-retention work as a durable state/claim rather than a single timed destructive loop. A campaign becomes eligible after 30 days from authoritative `deletedAt`; deletion work is independently retryable and must be safe when a prior worker partially completes.
7. Never infer that a timeout means an external publish/delete succeeded. Unknown provider outcomes remain recoverable/reconcilable rather than automatically retried as duplicates.
8. Bound per-run work and leave resumable progress so large campaigns cannot monopolize a Convex transaction.
9. Add focused static verification for schema/index names, claim semantics, terminal-state mapping, 30-day gate, idempotency, and no client-authoritative financial mutations.
10. Validate in Development with overlapping lifecycle/automation runs, duplicate invocations, partial deletion failure, retry, and concurrent `distributedPosts` writers before any Production promotion.

## Acceptance evidence
- Exact current-main base/head recorded in the PR.
- Exact-head CI executes and passes.
- Agent 2+3 audits only the final implementation head.
- Development proves single-winner lifecycle claims, repeat-run convergence, partial-failure recovery, and no duplicate/destructive cross-run behavior.
- Production deployment/source reconciliation is documented before promotion.
- Agent 3 performs final publication review.

## Explicit non-goals
- Do not change donation authorization or disable donations for terminal campaigns.
- Do not replace the authoritative Convex architecture with Base44 mirror writes.
- Do not delete linked records merely because a campaign is old; the authoritative `deletedAt` plus retention interval is required.
- Do not claim Issue #16 complete until the runtime and final-review gates pass.
