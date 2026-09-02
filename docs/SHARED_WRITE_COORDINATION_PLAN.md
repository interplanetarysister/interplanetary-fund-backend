# Shared Convex Write Coordination Plan

Status: planning checkpoint for Issue #71. This document is intentionally implementation-neutral until canonical writers are inventoried and the Development harness can observe the real deployed topology.

## Problem
Production has reported repeated Convex write conflicts involving `cron_commit_mut...` records while automation, lifecycle, payment, raised-total, and exchange-rate writers overlap. Serializing one worker or increasing retries is not sufficient because it can conceal the conflicting read-then-write boundary.

## Required inventory before code changes
- `runAllAgentAutomation`
- `runCoordinatorAutomation`
- `runScoutAutomation`
- `checkSiteHealth`
- `runPostProductionAutomation`
- exchange-rate cache refresh
- payment settlement / donation confirmation
- raised-total synchronization
- lifecycle continuation
- any writer of `distributedPosts`, agent state, campaign state, or shared cron records

For each writer, record: entrypoint, tables/indexes read, tables/indexes written, idempotency key, retry behavior, whether it can overlap, and whether it can continue after a stale worker loses ownership.

## Coordination contract
The implementation must provide a durable, server-side coordination boundary with:

1. **Scoped ownership** — each logical job/resource has one active owner token.
2. **Lease expiry** — ownership expires after a bounded interval.
3. **Fencing** — every write verifies the current owner token so stale continuations cannot write.
4. **Idempotent completion** — replaying the same logical operation converges without duplicate financial rows, status writes, or deletes.
5. **Failure-safe resume** — a failed transaction can be retried or taken over without skipping siblings or corrupting cursors.
6. **No self-triggering loop** — scheduled continuation is bounded and only scheduled after successful commit.

The chosen primitive may be a coordination table plus claim/renew/release helpers or an equivalent design, but it must be applied consistently across the inventoried writers rather than only to one worker.

## Development validation matrix
The implementing PR must attach exact-head evidence for the same SHA covering:

- overlapping lifecycle and automation runs;
- duplicate lifecycle invocation;
- duplicate PayPal delivery and same-key donation-intent replay;
- exchange-rate refresh overlap;
- forced transaction failure;
- provider verification failure;
- downstream partial failure;
- stale-worker takeover after lease expiry;
- >100 child rows and durable cursor continuation;
- repeated runs until convergence.

The result must report zero underlying `cron_commit_mut...` conflicts and must distinguish true absence of conflicts from eventual success after retries.

## Publication gates
- Canonical `main` is reconciled before implementation and again before promotion.
- Exact-head `npm ci`, verifier, typecheck, build, and Convex codegen/dev checks pass.
- Agent 2+3 review passes on the exact head.
- Agent 1 corrects every valid finding.
- Agent 3 performs final publication review.
- Agent 1 does not merge or publish.
