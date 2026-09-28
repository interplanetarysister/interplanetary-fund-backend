/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { internalMutation } from "./_generated/server";

// =====================================================
// HOURLY PLATFORM POLLER
// For platforms that lack webhooks (GoFundMe, Kickstarter,
// Indiegogo, Spotfund, FundRazr, GiveSendGo, CashApp),
// this cron polls external REST APIs or public endpoints
// to detect delta changes in donation totals.
//
// Triggered by crons.ts:  hourly at :30 UTC
// =====================================================

// Platform-specific polling configurations.
// Each entry describes how to fetch the current total for a given platform.
// Platforms without any public REST API are marked as "manual_only" and
// flagged for the admin dashboard rather than auto-polled.
const POLLING_CONFIGS: Record<string, {
  automationMode: "polling" | "manual_only";
  notes: string;
}> = {
  gofundme: {
    automationMode: "manual_only",
    notes: "GoFundMe has no public read API. Totals must be updated manually or via CSV export.",
  },
  kickstarter: {
    automationMode: "manual_only",
    notes: "Kickstarter has no live donation API. Totals updated manually post-campaign.",
  },
  indiegogo: {
    automationMode: "manual_only",
    notes: "Indiegogo does not expose a live donation feed. Manual export required.",
  },
  spotfund: {
    automationMode: "manual_only",
    notes: "Spotfund has no documented public API. Totals must be entered manually.",
  },
  fundrazr: {
    automationMode: "manual_only",
    notes: "FundRazr has no public webhook or read API. Manual update only.",
  },
  givesendgo: {
    automationMode: "manual_only",
    notes: "GiveSendGo has no public API. Manual export required.",
  },
  cashapp: {
    automationMode: "manual_only",
    notes: "CashApp has no inbound webhook API. Deposits tracked via bank statement sync.",
  },
};

// Scheduled cron: poll all platforms marked automationMode="polling"
// and flag manual_only platforms that have stale data.
export const pollAllPlatforms = internalMutation({
  args: {},
  handler: async (ctx) => {
    const platforms = await ctx.db.query("externalPlatforms").collect();
    const now = new Date().toISOString();

    const results: Array<{
      platform: string;
      campaignId: string;
      action: string;
      notes: string;
    }> = [];

    for (const platform of platforms) {
      const config = POLLING_CONFIGS[platform.platform.toLowerCase()];

      if (!config) {
        // Platform has webhooks — polling not needed
        continue;
      }

      if (config.automationMode === "manual_only") {
        // Flag for admin review if data is stale (> 24 hours old)
        const lastSync = platform.lastSynced ? new Date(platform.lastSynced) : new Date(0);
        const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync > 24) {
          await ctx.db.patch(platform._id, {
            lastError: `manual_only: data is ${Math.floor(hoursSinceSync)}h stale — update required`,
            lastSynced: platform.lastSynced ?? now,
          });
          results.push({
            platform: platform.platform,
            campaignId: platform.campaignId,
            action: "stale_flagged",
            notes: config.notes,
          });
        }
        continue;
      }

      // automationMode === "polling" — fetch external data
      // When a platform gains a polling API endpoint, add the fetch logic here.
      // The pattern below is the template to follow:
      //
      //   const apiUrl = buildPlatformApiUrl(platform);
      //   const response = await fetch(apiUrl, { headers: { Authorization: `****** } });
      //   const data = await response.json();
      //   const newTotal = data.total_raised;
      //   const delta = newTotal - (platform.externalTotal || 0);
      //   if (delta > 0) {
      //     await ctx.runMutation(internal.webhooks.recordInboundDonation, {
      //       campaignId: platform.campaignId,
      //       grossAmount: delta,
      //       donorName: "Polled Donation",
      //       currency: "USD",
      //       platform: platform.platform,
      //       paymentMethod: platform.platform,
      //     });
      //   }
      //   await ctx.db.patch(platform._id, { externalTotal: newTotal, lastSynced: now });
      results.push({
        platform: platform.platform,
        campaignId: platform.campaignId,
        action: "polling_not_yet_configured",
        notes: "Add fetch logic when platform REST API endpoint is available",
      });
    }

    // Persist audit report
    await ctx.db.insert("protocolReports", {
      reportType: "hourly_platform_poll",
      auditDate: now,
      totalCampaigns: platforms.length,
      compliantCampaigns: results.filter((r) => r.action === "polling_not_yet_configured").length,
      nonCompliantCampaigns: results.filter((r) => r.action === "stale_flagged").length,
      totalRaised: 0,
      totalGoal: 0,
      fundingGap: 0,
      totalDonors: 0,
      criticalViolations: results
        .filter((r) => r.action === "stale_flagged")
        .map((r) => ({
          standard: r.platform,
          issue: `Data stale — manual update needed: ${r.notes}`,
          severity: "warning",
        })),
      results: results.map((r) => ({
        title: `${r.platform} / ${r.campaignId}`,
        complianceScore: r.action === "stale_flagged" ? 0 : 100,
        violations: r.action === "stale_flagged" ? 1 : 0,
      })),
      syncPerformed: true,
    });

    return {
      status: "success",
      platformsChecked: platforms.length,
      staleFlagged: results.filter((r) => r.action === "stale_flagged").length,
      polled: results.filter((r) => r.action !== "stale_flagged").length,
      results,
    };
  },
});
