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
 * the current transaction commits. Child cursors are carried independently so
 * campaigns with more than 100 listings/posts converge across transactions.
 *
 * No external API is called here. The worker only performs deterministic Convex
 * reads/writes and is internal-only. Payment remains enabled for terminal
 * campaigns; this worker never disables donation intake.
 *
 * For deletion retention, the campaign's lastSynced value is treated as a
 * conservative lower-bound marker. Cleanup is delayed when that marker is
 * missing or younger than 30 days rather than deleting early. Cleanup pages are
 * bounded to 100 records per transaction so large campaigns converge safely.
 */
export const syncCampaignLifecycle = internalMutation({
  args: {
    status: v.string(),
    cursor: v.optional(v.string()),
    campaignId: v.optional(v.string()),
    listingCursor: v.optional(v.string()),
    distributedPostCursor: v.optional(v.string()),
    facebookPostCursor: v.optional(v.string()),
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
      if (args.campaignId && campaign.ifCampaignId !== args.campaignId) continue;
      campaignsProcessed += 1;

      // Terminal campaigns must remain donation-capable. Only repair the field
      // when it is actually false, avoiding an unnecessary write on every pass.
      // Do not mutate lastSynced: it is the deletion-retention lower bound.
      if (!campaign.paymentActive) {
        await ctx.db.patch(campaign._id, {
          paymentActive: true,
        });
        campaignsReopenedForDonations += 1;
      }

      const listingsPage = await ctx.db
        .query("externalPlatforms")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .paginate({
          numItems: LISTING_PAGE_SIZE,
          cursor: args.listingCursor ?? null,
          maximumRowsRead: LISTING_PAGE_SIZE,
        });

      for (const listing of listingsPage.page) {
        if (listing.status === listingStatus) continue;

        await ctx.db.patch(listing._id, {
          status: listingStatus,
          lastSynced: nowIso,
        });
        listingsUpdated += 1;
      }

      if (!listingsPage.isDone) {
        await ctx.scheduler.runAfter(0, internal.campaignLifecycleInternal.syncCampaignLifecycle, {
          status: args.status,
          cursor: args.cursor,
          campaignId: campaign.ifCampaignId,
          listingCursor: listingsPage.continueCursor,
        });
        return {
          status: "success",
          lifecycleStatus: args.status,
          campaignsProcessed,
          listingsUpdated,
          campaignsReopenedForDonations,
          distributedPostsDeleted,
          facebookPostsDeleted,
          isDone: false,
          continueCursor: listingsPage.continueCursor,
          executedAt: nowIso,
        };
      }

      if (args.status !== "deleted" || !isAtLeastRetentionAge(campaign.lastSynced, nowMs)) {
        continue;
      }

      const distributedPostsPage = await ctx.db
        .query("distributedPosts")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .paginate({
          numItems: POST_DELETE_BATCH_SIZE,
          cursor: args.distributedPostCursor ?? null,
          maximumRowsRead: POST_DELETE_BATCH_SIZE,
        });
      for (const post of distributedPostsPage.page) {
        await ctx.db.delete(post._id);
        distributedPostsDeleted += 1;
      }

      if (!distributedPostsPage.isDone) {
        await ctx.scheduler.runAfter(0, internal.campaignLifecycleInternal.syncCampaignLifecycle, {
          status: args.status,
          cursor: args.cursor,
          campaignId: campaign.ifCampaignId,
          distributedPostCursor: distributedPostsPage.continueCursor,
        });
        return {
          status: "success",
          lifecycleStatus: args.status,
          campaignsProcessed,
          listingsUpdated,
          campaignsReopenedForDonations,
          distributedPostsDeleted,
          facebookPostsDeleted,
          isDone: false,
          continueCursor: distributedPostsPage.continueCursor,
          executedAt: nowIso,
        };
      }

      const facebookPostsPage = await ctx.db
        .query("facebookGroupPosts")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .paginate({
          numItems: POST_DELETE_BATCH_SIZE,
          cursor: args.facebookPostCursor ?? null,
          maximumRowsRead: POST_DELETE_BATCH_SIZE,
        });
      for (const post of facebookPostsPage.page) {
        await ctx.db.delete(post._id);
        facebookPostsDeleted += 1;
      }

      if (!facebookPostsPage.isDone) {
        await ctx.scheduler.runAfter(0, internal.campaignLifecycleInternal.syncCampaignLifecycle, {
          status: args.status,
          cursor: args.cursor,
          campaignId: campaign.ifCampaignId,
          facebookPostCursor: facebookPostsPage.continueCursor,
        });
        return {
          status: "success",
          lifecycleStatus: args.status,
          campaignsProcessed,
          listingsUpdated,
          campaignsReopenedForDonations,
          distributedPostsDeleted,
          facebookPostsDeleted,
          isDone: false,
          continueCursor: facebookPostsPage.continueCursor,
          executedAt: nowIso,
        };
      }
    }

    // Continue the same indexed campaign page only after this transaction has
    // committed. Then advance to the next terminal status. Child cursors are
    // reset whenever a child collection finishes so they never leak across
    // campaigns.
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
