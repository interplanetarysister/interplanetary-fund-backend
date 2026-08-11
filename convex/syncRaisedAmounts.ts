/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Internal version called by the cron
export const syncAllCampaignTotalsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await _syncAll(ctx);
  },
});

// Public mutation for manual triggering from admin UI
export const syncAllCampaignTotals = mutation({
  args: {},
  handler: async (ctx) => {
    return await _syncAll(ctx);
  },
});

async function _syncAll(ctx: any) {
  const campaigns = await ctx.db.query("monitoredCampaigns").collect();
  const connections = await ctx.db.query("externalPlatforms").collect();

  const results = [];

  for (const campaign of campaigns) {
    const platformTotal = connections
      .filter((c: any) => c.campaignId === campaign.ifCampaignId)
      .reduce((sum: number, c: any) => sum + (c.externalTotal || 0), 0);

    const platformDonors = connections
      .filter((c: any) => c.campaignId === campaign.ifCampaignId)
      .reduce((sum: number, c: any) => sum + (c.externalDonorCount || 0), 0);

    const platformCount = connections
      .filter((c: any) => c.campaignId === campaign.ifCampaignId).length;

    if (
      platformTotal !== campaign.raisedAmount ||
      platformDonors !== campaign.donorCount
    ) {
      await ctx.db.patch(campaign._id, {
        raisedAmount: platformTotal,
        donorCount: platformDonors,
        externalRaised: platformTotal,
        externalDonors: platformDonors,
        platformCount,
        lastSynced: new Date().toISOString(),
      });
      results.push({
        campaign: campaign.title,
        oldRaised: campaign.raisedAmount,
        newRaised: platformTotal,
        oldDonors: campaign.donorCount,
        newDonors: platformDonors,
      });
    }
  }

  return {
    status: "success",
    campaignsUpdated: results.length,
    details: results,
    syncedAt: new Date().toISOString(),
  };
}

// Get aggregated totals across all campaigns
export const getAggregatedTotals = query({
  args: {},
  handler: async (ctx) => {
    const campaigns = await ctx.db.query("monitoredCampaigns").collect();

    const totalRaised = campaigns.reduce((sum, c) => sum + (c.raisedAmount || 0), 0);
    const totalGoal = campaigns.reduce((sum, c) => sum + (c.goalAmount || 0), 0);
    const totalDonors = campaigns.reduce((sum, c) => sum + (c.donorCount || 0), 0);

    return {
      totalRaised,
      totalGoal,
      totalDonors,
      campaignCount: campaigns.length,
      fundingGap: totalGoal - totalRaised,
      progressPercent: totalGoal > 0 ? (totalRaised / totalGoal) * 100 : 0,
    };
  },
});

// Weekly balance check — detect platforms with non-zero balance and flag for migration
export const weeklyBalanceCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const platforms = await ctx.db.query("externalPlatforms").collect();
    const platformsWithBalance = platforms.filter(p => (p.externalTotal || 0) > 0);

    const alerts = platformsWithBalance.map(p => ({
      platform: p.platform,
      displayName: p.displayName,
      campaignId: p.campaignId,
      balance: p.externalTotal,
      lastSynced: p.lastSynced,
      action: "migrate_funds",
    }));

    return {
      status: "success",
      checkedAt: new Date().toISOString(),
      platformsChecked: platforms.length,
      platformsWithBalance: platformsWithBalance.length,
      totalExternalBalance: platformsWithBalance.reduce((s, p) => s + (p.externalTotal || 0), 0),
      alerts,
    };
  },
});
