# Canonical Convex Cron / Writer Inventory

**Source revision:** `main` at `6e9adae9d3233d616a44f9312e4e09c9ff17d541`

This document is an implementation-neutral inventory for reliability work. It does not change runtime behavior and must be revalidated whenever `convex/crons.ts` or any target function changes.

## Registered cron entries

| Cron name | Cadence (UTC) | Entrypoint | Primary write-risk surface |
|---|---:|---|---|
| `daily-protocol-enforcement` | Daily 13:00 | `internal.protocol.weeklyTraining` | `protocolReports`, agent state, campaign/platform reads and writes |
| `weekly-training-session` | Saturday 09:00 | `internal.protocol.weeklyTraining` | Duplicate invocation of the same entrypoint; report/agent-state side effects |
| `daily-post-generation` | Daily 15:00 | `internal.postContent.autoGeneratePosts` | `distributedPosts`, campaign/post state |
| `daily-auto-publish-pipeline` | Daily 15:30 | `internal.postContent.autoPublishApprovedPosts` | `distributedPosts`, publish state, external platform state |
| `daily-raised-amount-sync` | Daily 12:00 | `internal.syncRaisedAmounts.syncAllCampaignTotalsInternal` | `monitoredCampaigns.raisedAmount` from external platform totals; source-of-truth conflict |
| `weekly-balance-check` | Sunday 13:00 | `internal.syncRaisedAmounts.weeklyBalanceCheck` | Balance detection and migration-related state |
| `weekly-platform-cleanup` | Monday 10:00 | `internal.cleanupPlatformsInternal.cleanupPlaceholderUrlsInternal` | External platform status/display-name cleanup |
| `daily-campaign-defaults` | Daily 14:00 | `internal.campaignDefaultsInternal.enforceAllDefaults` | Campaign default/status/payment/outreach fields |
| `daily-platform-balance-check` | Daily 16:00 | `internal.fundMigration.checkBalancesAndQueueMigrations` | Migration queue / payout-related state |

## Required follow-up before runtime changes

- Reconcile this source inventory against deployed Development and Production Convex functions and cron topology.
- Resolve the duplicate `weeklyTraining` schedule under Issue #74 before changing its side effects.
- Resolve the external-total → `monitoredCampaigns.raisedAmount` writer under Issues #8/#11 before treating campaign totals as authoritative.
- Add exact file/function/table/index/write-set references for each entrypoint during the #71 implementation pass.
- Validate overlap, duplicate delivery, forced failure, retry/replay, and stale-worker fencing in Development with raw underlying `cron_commit_mut...` conflict telemetry.

## Non-goals

This document does not claim exactly-once execution, production readiness, or source-of-truth correctness. It is a current-main evidence artifact only.
