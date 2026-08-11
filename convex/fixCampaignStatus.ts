/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Fix campaigns: activate drafts, set payment_active, add summaries
export const fixAllCampaigns = mutation({
  args: {},
  handler: async (ctx) => {
    const campaigns = await ctx.db.query("monitoredCampaigns").collect();
    const fixed = [];
    
    for (const campaign of campaigns) {
      const updates: any = {};
      
      // Activate drafts
      if (campaign.status === "draft") {
        updates.status = "active";
      }
      
      // Set payment_active if not set
      if (!campaign.paymentActive) {
        updates.paymentActive = true;
      }
      
      // Set outreach_enabled if not set
      if (!campaign.outreachEnabled) {
        updates.outreachEnabled = true;
      }
      
      // Generate summary if empty
      if (!campaign.summary || campaign.summary.trim() === "") {
        updates.summary = `${campaign.title} — a campaign by Interplanetary Fund. Support our mission to make a difference.`;
      }
      
      if (Object.keys(updates).length > 0) {
        updates.lastSynced = new Date().toISOString();
        await ctx.db.patch(campaign._id, updates);
        fixed.push({
          campaign: campaign.title,
          changes: Object.keys(updates),
        });
      }
    }
    
    return {
      status: "success",
      campaignsFixed: fixed.length,
      details: fixed,
    };
  },
});

export const autoCompleteExpiredCampaigns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const activeCampaigns = await ctx.db.query("monitoredCampaigns")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .collect();
    const now = Date.now();
    const completed = [];

    for (const campaign of activeCampaigns) {
      const endDate = campaign.endDate ? Date.parse(campaign.endDate) : NaN;
      if (!Number.isNaN(endDate) && endDate < now) {
        await ctx.db.patch(campaign._id, {
          status: "completed",
          lastSynced: new Date().toISOString(),
        });
        completed.push({
          campaign: campaign.title,
          endDate: campaign.endDate,
        });
      }
    }

    return {
      status: "success",
      campaignsChecked: activeCampaigns.length,
      campaignsCompleted: completed.length,
      details: completed,
    };
  },
});
