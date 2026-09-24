# Canonical Convex Cron and Writer Inventory

**Source commit:** `6b0c6a841d4dcd1e63bad72f795454348a1c7990`  
**Source file:** `convex/crons.ts`  
**Purpose:** implementation-neutral evidence for Agent 2+3 review and the shared coordination workstream. This document does not claim runtime or deployment validation.

## Registered cron entrypoints

| Schedule | Entry point | Primary risk / follow-up |
|---|---|---|
| Daily 13:00 UTC | `internal.protocol.weeklyTraining` | Side-effecting protocol training job; duplicate semantic scheduling with the weekly entrypoint; unbounded reads/writes require bounded continuation and idempotency review. |
| Weekly Saturday 09:00 UTC | `internal.protocol.weeklyTraining` | Same mutation as daily entrypoint; intended cadence must be classified before removing or splitting schedules. |
| Daily 15:00 UTC | `internal.postContent.autoGeneratePosts` | Generates distributed post records; inspect overlap with other post writers and bound campaign/page traversal. |
| Daily 15:30 UTC | `internal.postContent.autoPublishApprovedPosts` | Publishes or queues posts; inspect duplicate-run behavior and per-platform write contention. |
| Daily 12:00 UTC | `internal.syncRaisedAmounts.syncAllCampaignTotalsInternal` | Writes `monitoredCampaigns.raisedAmount` from external totals; conflicts with IF-authoritative financial semantics and must be reconciled with payment/source-of-truth work. |
| Weekly Sunday 13:00 UTC | `internal.syncRaisedAmounts.weeklyBalanceCheck` | Balance detection and migration queueing; inspect idempotency and interaction with the daily balance-check path. |
| Weekly Monday 10:00 UTC | `internal.cleanupPlatformsInternal.cleanupPlaceholderUrlsInternal` | Cleanup writes to external-platform records; ensure bounded pagination and safe coexistence with platform sync. |
| Daily 14:00 UTC | `internal.campaignDefaultsInternal.enforceAllDefaults` | Broad campaign patching; inspect overlap with campaign sync/lifecycle writers and preserve authoritative fields. |
| Daily 16:00 UTC | `internal.fundMigration.checkBalancesAndQueueMigrations` | Queues migrations from external balances; inspect duplicate queue prevention and owner/amount authority. |

## Verified risk observations

1. `weeklyTraining` is registered twice against the same internal mutation. This is a duplicate scheduling risk and a potential duplicate-report / repeated-agent-write risk.
2. The raised-amount sync path is a financial writer that derives campaign totals from `externalPlatforms.externalTotal`. This must not be treated as authoritative until Issue #8/#11 source-of-truth work proves the intended behavior.
3. Balance-check and migration-queue entrypoints are separate writer surfaces and require explicit idempotency and duplicate-run semantics.
4. The inventory is based on canonical source only. It does not prove what is deployed in Development or Production; deployed topology and behavior must be reconciled before runtime changes or promotion.

## Required validation before runtime changes

- Compare this exact source inventory against deployed Development and Production Convex cron topology.
- Identify every writer touching the same records and define a scoped coordination key.
- Validate atomic claim, lease renewal, takeover/fencing, stale-worker rejection, idempotent completion, replay behavior, and bounded continuation in Development.
- Exercise overlapping invocations, transient failure, retry, and large-row-count cases.
- Verify raw underlying `cron_commit_mut...` conflict metrics rather than accepting retry-masked success.

## Queue linkage

- #71/#72 shared coordination and Development conflict harness
- #74 duplicate protocol cron and bounded training execution
- #77/#78 schedule/source reconciliation
- #82 bounded balance/migration writers
- #8/#11 financial source-of-truth and settlement integrity
- #83 webhook verification and poller boundedness
