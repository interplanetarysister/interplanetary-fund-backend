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
  const donations = await ctx.db.query("donations").collect();

  const results = [];

  for (const campaign of campaigns) {
    const confirmedDonations = donations.filter(
      (d: any) =>
        d.campaignId === campaign.ifCampaignId &&
        (d.status === "confirmed" || d.status === "completed")
    );
    const totalRaisedInIf = confirmedDonations.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
    const totalDonorsInIf = confirmedDonations.length;

    const outreachClicks = connections
      .filter((c: any) => c.campaignId === campaign.ifCampaignId)
      .reduce((sum: number, c: any) => sum + (c.linkClicks || 0), 0);

    const platformCount = connections
      .filter((c: any) => c.campaignId === campaign.ifCampaignId).length;

    if (
      totalRaisedInIf !== campaign.raisedAmount ||
      totalDonorsInIf !== campaign.donorCount ||
      outreachClicks !== campaign.externalDonors
    ) {
      await ctx.db.patch(campaign._id, {
        raisedAmount: totalRaisedInIf,
        donorCount: totalDonorsInIf,
        externalRaised: 0,
        externalDonors: outreachClicks,
        platformCount,
        lastSynced: new Date().toISOString(),
      });
      results.push({
        campaign: campaign.title,
        oldRaised: campaign.raisedAmount,
        newRaised: totalRaisedInIf,
        oldDonors: campaign.donorCount,
        newDonors: totalDonorsInIf,
        outreachClicks,
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
    const platformsWithOutreach = platforms.filter(p => (p.linkClicks || 0) > 0);

    const alerts = platformsWithOutreach.map(p => ({
      platform: p.platform,
      displayName: p.displayName,
      campaignId: p.campaignId,
      clicks: p.linkClicks || 0,
      lastSynced: p.lastSynced,
      action: "optimize_outreach",
    }));

    return {
      status: "success",
      checkedAt: new Date().toISOString(),
      platformsChecked: platforms.length,
      platformsWithBalance: platformsWithOutreach.length,
      totalExternalBalance: 0,
      totalOutreachClicks: platformsWithOutreach.reduce((s, p) => s + (p.linkClicks || 0), 0),
      alerts,
    };
  },
});
