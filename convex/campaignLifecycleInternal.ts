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

function isAtLeastRetentionAge(isoDate: string, nowMs: number): boolean {
  const timestamp = Date.parse(isoDate);
  return Number.isFinite(timestamp) && nowMs - timestamp >= RETENTION_MS;
}

/**
 * Concurrency-safe lifecycle worker.
 *
 * The cron starts a single cursor chain. Each mutation processes only one
 * indexed campaign page and bounded per-campaign child records, then schedules
 * the next page after the current transaction commits. This keeps the read/write
 * set small and prevents an all-table lifecycle sweep from colliding with the
 * automation writers that also touch distributedPosts/externalPlatforms.
 *
 * `externalPlatforms.lastSynced` is used as the lifecycle observation marker:
 * it is advanced only when this worker changes a listing to its terminal state.
 * Deleted-post retention therefore never deletes immediately on first discovery;
 * it requires a terminal listing marker that is at least 30 days old. If a
 * campaign has no linked external listing, cleanup is conservatively deferred.
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

      let lifecycleMarker: string | undefined;
      for (const listing of listings) {
        if (listing.status === listingStatus) {
          lifecycleMarker ??= listing.lastSynced;
          continue;
        }

        await ctx.db.patch(listing._id, {
          status: listingStatus,
          lastSynced: nowIso,
        });
        lifecycleMarker = nowIso;
        listingsUpdated += 1;
      }

      if (args.status !== "deleted" || !lifecycleMarker) {
        continue;
      }

      // Retention starts from the first authoritative terminal-listing marker.
      // If another sync updates the listing later, retention is conservatively
      // delayed rather than risking premature deletion.
      if (!isAtLeastRetentionAge(lifecycleMarker, nowMs)) {
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
