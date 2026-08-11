/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { internalMutation } from "./_generated/server";

// Internal cron-callable version of enforceAllCampaignDefaults (issues #4, #10)
// Runs daily to ensure all campaigns have required fields set
export const enforceAllDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const campaigns = await ctx.db.query("monitoredCampaigns").collect();
    const results = [];

    for (const campaign of campaigns) {
      const updates: Record<string, any> = {};

      // P-1: outreach always on
      if (!campaign.outreachEnabled) updates.outreachEnabled = true;
      // P-2: payment always active
      if (!campaign.paymentActive) updates.paymentActive = true;
      // Status: never leave as blank
      if (!campaign.status || campaign.status === "") updates.status = "active";
      // Donor count default
      if (campaign.donorCount === undefined || campaign.donorCount === null) updates.donorCount = 0;
      // Raised amount default
      if (campaign.raisedAmount === undefined || campaign.raisedAmount === null) updates.raisedAmount = 0;
      // Auto-summary for blank summaries
      if (!campaign.summary || campaign.summary.trim() === "") {
        updates.summary = `${campaign.title} — a campaign by Interplanetary Fund.`;
      }
      // Default CashApp tag for all campaigns (issue #4)
      if (!campaign.cashappTag) updates.cashappTag = "$unrewound";

      updates.lastSynced = new Date().toISOString();

      if (Object.keys(updates).length > 1) { // > 1 because lastSynced is always set
        await ctx.db.patch(campaign._id, updates);
        results.push({ campaign: campaign.title, fixes: Object.keys(updates) });
      }
    }

    return {
      status: "success",
      campaignsChecked: campaigns.length,
      campaignsFixed: results.length,
      enforceAt: new Date().toISOString(),
      details: results,
    };
  },
});
