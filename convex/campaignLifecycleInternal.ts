/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

const TERMINAL_STATUSES = {
  closed: "campaign_closed",
  finished: "campaign_finished",
  deleted: "campaign_deleted",
} as const;

const CAMPAIGN_PAGE_SIZE = 25;
const LISTING_PAGE_SIZE = 100;
const POST_DELETE_BATCH_SIZE = 100;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type TerminalStatus = keyof typeof TERMINAL_STATUSES;

function isTerminalStatus(status: string): status is TerminalStatus {
  return Object.prototype.hasOwnProperty.call(TERMINAL_STATUSES, status);
}

function isAtLeastRetentionAge(isoDate: string | undefined, nowMs: number): boolean {
  if (!isoDate) return false;
  const timestamp = Date.parse(isoDate);
  return Number.isFinite(timestamp) && nowMs - timestamp >= RETENTION_MS;
}

/**
 * Bounded, resumable lifecycle worker for terminal campaigns.
 *
 * The cron starts one cursor chain. Every transaction reads one indexed page of
 * campaigns and bounded child records, then schedules the next page only after
 * the current transaction commits. This avoids the all-table read/write set
 * used by the stale lifecycle implementation and materially reduces overlap
 * with automation writers touching externalPlatforms/distributedPosts.
 *
 * No external API is called here. The worker only performs deterministic Convex
 * reads/writes and is internal-only. Payment remains enabled for terminal
 * campaigns; this worker never disables donation intake.
 *
 * For deletion retention, the campaign's lastSynced value is treated as a
 * conservative lower-bound marker. Current syncCampaign/bulkSyncCampaigns
 * already update lastSynced when the campaign status changes, so cleanup cannot
 * happen during the first 30 days unless that marker is already at least 30 days
 * old. If status provenance is ambiguous, retention is delayed rather than
 * deleting early. Cleanup is also bounded to 100 posts per table per pass so
 * large campaigns converge across subsequent scheduled passes.
 */
export const syncCampaignLifecycle = internalMutation({
  args: {
    status: v.string(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!isTerminalStatus(args.status)) {
      throw new Error("Invalid lifecycle status");
    }

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const listingStatus = TERMINAL_STATUSES[args.status];

    const page = await ctx.db
      .query("monitoredCampaigns")
      .withIndex("byStatus", (q) => q.eq("status", args.status))
      .paginate({
        numItems: CAMPAIGN_PAGE_SIZE,
        cursor: args.cursor ?? null,
        maximumRowsRead: CAMPAIGN_PAGE_SIZE,
      });

    let campaignsProcessed = 0;
    let listingsUpdated = 0;
    let campaignsReopenedForDonations = 0;
    let distributedPostsDeleted = 0;
    let facebookPostsDeleted = 0;

    for (const campaign of page.page) {
      campaignsProcessed += 1;

      // Terminal campaigns must remain donation-capable. Only repair the field
      // when it is actually false, avoiding an unnecessary write on every pass.
      if (!campaign.paymentActive) {
        await ctx.db.patch(campaign._id, {
          paymentActive: true,
          lastSynced: nowIso,
        });
        campaignsReopenedForDonations += 1;
      }

      const listings = await ctx.db
        .query("externalPlatforms")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .take(LISTING_PAGE_SIZE);

      for (const listing of listings) {
        if (listing.status === listingStatus) continue;

        await ctx.db.patch(listing._id, {
          status: listingStatus,
          lastSynced: nowIso,
        });
        listingsUpdated += 1;
      }

      if (args.status !== "deleted" || !isAtLeastRetentionAge(campaign.lastSynced, nowMs)) {
        continue;
      }

      const distributedPosts = await ctx.db
        .query("distributedPosts")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .take(POST_DELETE_BATCH_SIZE);
      for (const post of distributedPosts) {
        await ctx.db.delete(post._id);
        distributedPostsDeleted += 1;
      }

      const facebookPosts = await ctx.db
        .query("facebookGroupPosts")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .take(POST_DELETE_BATCH_SIZE);
      for (const post of facebookPosts) {
        await ctx.db.delete(post._id);
        facebookPostsDeleted += 1;
      }
    }

    // Continue the same indexed status page only after this transaction has
    // committed. Then advance to the next terminal status. Scheduled mutations
    // are durable and exactly-once, so a transient failure resumes safely.
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.campaignLifecycleInternal.syncCampaignLifecycle, {
        status: args.status,
        cursor: page.continueCursor,
      });
    } else if (args.status === "closed") {
      await ctx.scheduler.runAfter(0, internal.campaignLifecycleInternal.syncCampaignLifecycle, {
        status: "finished",
      });
    } else if (args.status === "finished") {
      await ctx.scheduler.runAfter(0, internal.campaignLifecycleInternal.syncCampaignLifecycle, {
        status: "deleted",
      });
    }

    return {
      status: "success",
      lifecycleStatus: args.status,
      campaignsProcessed,
      listingsUpdated,
      campaignsReopenedForDonations,
      distributedPostsDeleted,
      facebookPostsDeleted,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
      executedAt: nowIso,
    };
  },
});
