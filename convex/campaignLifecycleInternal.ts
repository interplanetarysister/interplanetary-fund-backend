/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { internalMutation } from "./_generated/server";

const LIFECYCLE_STATUS_TO_LISTING_STATUS: Record<string, string> = {
  closed: "campaign_closed",
  finished: "campaign_finished",
  deleted: "campaign_deleted",
};

function normalizeStatus(status: string | undefined): string {
  return String(status || "").trim().toLowerCase();
}

function isAtLeastDaysOld(isoDate: string | undefined, days: number, nowMs: number): boolean {
  if (!isoDate) return false;
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) return false;
  return nowMs - timestamp >= days * 24 * 60 * 60 * 1000;
}

// Daily lifecycle sync for closed/finished/deleted campaigns.
// - Propagates campaign terminal status to linked external platform listings.
// - Keeps donation path open.
// - Deletes linked posts 30 days after campaign deletion.
export const syncCampaignLifecycle = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const campaigns = await ctx.db.query("monitoredCampaigns").collect();
    const platforms = await ctx.db.query("externalPlatforms").collect();

    let platformsUpdated = 0;
    let donationsKeptOpen = 0;
    let campaignsStampedDeletedAt = 0;
    let distributedPostsDeleted = 0;
    let facebookPostsDeleted = 0;

    for (const campaign of campaigns) {
      const normalizedStatus = normalizeStatus(campaign.status);
      const listingStatus = LIFECYCLE_STATUS_TO_LISTING_STATUS[normalizedStatus];
      if (!listingStatus) continue;

      if (!campaign.paymentActive) {
        await ctx.db.patch(campaign._id, {
          paymentActive: true,
          lastSynced: nowIso,
        });
        donationsKeptOpen += 1;
      }

      for (const platform of platforms) {
        if (platform.campaignId !== campaign.ifCampaignId) continue;
        if (platform.status === listingStatus) continue;
        await ctx.db.patch(platform._id, {
          status: listingStatus,
          lastSynced: nowIso,
        });
        platformsUpdated += 1;
      }

      if (normalizedStatus !== "deleted") continue;

      const deletedAt = campaign.deletedAt || nowIso;
      if (!campaign.deletedAt) {
        await ctx.db.patch(campaign._id, {
          deletedAt,
          lastSynced: nowIso,
        });
        campaignsStampedDeletedAt += 1;
      }

      if (!isAtLeastDaysOld(deletedAt, 30, nowMs)) continue;

      const linkedDistributedPosts = await ctx.db
        .query("distributedPosts")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .collect();
      for (const post of linkedDistributedPosts) {
        await ctx.db.delete(post._id);
        distributedPostsDeleted += 1;
      }

      const linkedFacebookPosts = await ctx.db
        .query("facebookGroupPosts")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .collect();
      for (const post of linkedFacebookPosts) {
        await ctx.db.delete(post._id);
        facebookPostsDeleted += 1;
      }
    }

    return {
      status: "success",
      campaignsChecked: campaigns.length,
      platformsUpdated,
      donationsKeptOpen,
      campaignsStampedDeletedAt,
      distributedPostsDeleted,
      facebookPostsDeleted,
      executedAt: nowIso,
    };
  },
});
