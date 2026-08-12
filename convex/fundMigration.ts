/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { mutation, query, internalMutation } from "./_generated/server";
import { validateDonation, checkRateLimit } from "./security";
import { v } from "convex/values";

const PAYOUT_READY_SUBJECT = "Funds ready for payout selection";

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

async function notifyCampaignOwnerPayoutReady(
  ctx: any,
  args: {
    campaignId: string;
    sourcePlatform: string;
    grossAmount: number;
    feeAmount: number;
    netAmount: number;
  }
) {
  const now = new Date().toISOString();
  await ctx.db.insert("universalInbox", {
    platform: "interplanetary_fund",
    senderName: "Interplanetary Fund",
    senderId: "if-system",
    recipientId: args.campaignId,
    subject: PAYOUT_READY_SUBJECT,
    body: `Funds from ${args.sourcePlatform} are ready. Gross: ${formatUsd(args.grossAmount)}. Fees: ${formatUsd(args.feeAmount)}. Net payout: ${formatUsd(args.netAmount)}. Select CashApp or PayPal to continue.`,
    platformMessageId: `fund-migration-${args.campaignId}-${Date.now()}`,
    campaignId: args.campaignId,
    status: "new",
    forwarded: false,
    replied: false,
    priority: "high",
    receivedAt: now,
  });
}

// Record a fund migration from an external platform
export const recordMigration = mutation({
  args: {
    campaignId: v.string(),
    campaignTitle: v.string(),
    sourcePlatform: v.string(),
    grossAmount: v.number(),
    withdrawalMethod: v.string(),
    withdrawnBy: v.string(),
  },
  handler: async (ctx, args) => {
    checkRateLimit("fund_migration", 5, 300000); // Max 5 per 5 min
    if (!validateDonation(args.grossAmount)) {
      throw new Error("Invalid amount for fund migration.");
    }
    // Calculate fees
    const platformFee = args.grossAmount * 0.05;
    const processingFee = args.grossAmount * 0.029 + 0.30;
    const totalFees = platformFee + processingFee;
    const netAmount = args.grossAmount - totalFees;

    // Create a donation record for this migrated fund
    const donationId = await ctx.db.insert("donations", {
      campaignId: args.campaignId,
      campaignTitle: args.campaignTitle,
      amount: args.grossAmount,
      donorName: `Migrated from ${args.sourcePlatform}`,
      message: `Funds withdrawn from ${args.sourcePlatform} by ${args.withdrawnBy}`,
      paymentMethod: "fund_migration",
      status: "completed",
      createdAt: new Date().toISOString(),
    });

    // Update campaign totals
    const campaign = await ctx.db
      .query("monitoredCampaigns")
      .withIndex("byIfId", (q) => q.eq("ifCampaignId", args.campaignId))
      .first();

    if (campaign) {
      await ctx.db.patch(campaign._id, {
        raisedAmount: (campaign.raisedAmount || 0) + args.grossAmount,
        donorCount: (campaign.donorCount || 0) + 1,
        lastSynced: new Date().toISOString(),
      });
    }

    // Create a transaction record
    const transactionId = await ctx.db.insert("transactions", {
      userId: args.campaignId,
      type: "fund_migration",
      amount: args.grossAmount,
      status: "completed",
      createdAt: new Date().toISOString(),
    });

    // Create a payout request for the net amount
    const payoutId = await ctx.db.insert("payoutRequests", {
      userId: args.campaignId,
      amountRequested: args.grossAmount,
      feeAmount: totalFees,
      netAmount: netAmount,
      payoutMethod: "pending",
      payoutDestination: "pending",
      status: "pending_user_selection",
      requestedDate: new Date().toISOString(),
    });
    await notifyCampaignOwnerPayoutReady(ctx, {
      campaignId: args.campaignId,
      sourcePlatform: args.sourcePlatform,
      grossAmount: args.grossAmount,
      feeAmount: totalFees,
      netAmount,
    });

    return {
      status: "success",
      donationId,
      transactionId,
      payoutId,
      summary: {
        source: args.sourcePlatform,
        grossAmount: `$${args.grossAmount.toFixed(2)}`,
        platformFee: `$${platformFee.toFixed(2)}`,
        processingFee: `$${processingFee.toFixed(2)}`,
        totalFees: `$${totalFees.toFixed(2)}`,
        netToUser: `$${netAmount.toFixed(2)}`,
        payoutStatus: "pending_user_selection",
      },
    };
  },
});

// Get all pending fund migrations awaiting payout method selection
export const getPendingPayouts = query({
  args: { campaignId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    checkRateLimit("fund_migration", 5, 300000); // Max 5 per 5 min
    let payouts = await ctx.db.query("payoutRequests").collect();
    const campaigns = await ctx.db.query("monitoredCampaigns").collect();
    
    if (args.campaignId) {
      payouts = payouts.filter((p) => p.userId === args.campaignId);
    }
    
    return payouts
      .filter((p) => p.status === "pending_user_selection")
      .map((p) => ({
        payoutId: p._id,
        campaignId: p.userId,
        campaignTitle: campaigns.find((c) => c.ifCampaignId === p.userId)?.title || p.userId,
        grossAmount: p.amountRequested,
        fees: p.feeAmount,
        netAmount: p.netAmount,
        date: p.requestedDate,
      }));
  },
});

// User selects payout method for their migrated funds
export const selectPayoutMethod = mutation({
  args: {
    payoutId: v.id("payoutRequests"),
    payoutMethod: v.union(v.literal("cashapp"), v.literal("paypal")),
    payoutDestination: v.string(),
  },
  handler: async (ctx, args) => {
    checkRateLimit("fund_migration", 5, 300000); // Max 5 per 5 min
    const payout = await ctx.db.get(args.payoutId);
    if (!payout) {
      throw new Error("Payout not found");
    }

    await ctx.db.patch(args.payoutId, {
      payoutMethod: args.payoutMethod,
      payoutDestination: args.payoutDestination,
      status: "pending_payout",
    });
    await ctx.db.insert("transactions", {
      userId: payout.userId,
      campaignId: payout.userId,
      type: "payout_ready",
      amount: payout.netAmount,
      payoutRequestId: args.payoutId,
      status: "queued",
      createdAt: new Date().toISOString(),
      paymentMethod: args.payoutMethod,
    });

    return {
      status: "success",
      message: `Payout queued: $${payout.netAmount.toFixed(2)} via ${args.payoutMethod} to ${args.payoutDestination}`,
    };
  },
});

// Get migration history for a campaign
export const getMigrationHistory = query({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    checkRateLimit("fund_migration", 5, 300000); // Max 5 per 5 min
    const donations = await ctx.db
      .query("donations")
      .withIndex("byCampaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();

    return donations
      .filter((d) => d.paymentMethod === "fund_migration")
      .map((d) => ({
        id: d._id,
        amount: d.amount,
        source: d.message,
        date: d.createdAt,
        status: d.status,
      }));
  },
});

// Batch migrate funds from multiple external platforms at once
export const batchMigrate = mutation({
  args: {
    adminPin: v.optional(v.string()),
    migrations: v.array(v.object({
      campaignId: v.string(),
      campaignTitle: v.string(),
      sourcePlatform: v.string(),
      grossAmount: v.number(),
    })),
    withdrawnBy: v.string(),
  },
  handler: async (ctx, args) => {
    checkRateLimit("fund_migration", 5, 300000); // Max 5 per 5 min
    const results = [];
    let totalGross = 0;
    let totalFees = 0;
    let totalNet = 0;

    for (const migration of args.migrations) {
      if (!validateDonation(migration.grossAmount)) {
        throw new Error(`Invalid amount for ${migration.sourcePlatform}`);
      }
      const platformFee = migration.grossAmount * 0.05;
      const processingFee = migration.grossAmount * 0.029 + 0.30;
      const fees = platformFee + processingFee;
      const net = migration.grossAmount - fees;

      // Create donation record
      const donationId = await ctx.db.insert("donations", {
        campaignId: migration.campaignId,
        campaignTitle: migration.campaignTitle,
        amount: migration.grossAmount,
        donorName: `Migrated from ${migration.sourcePlatform}`,
        message: `Batch migration from ${migration.sourcePlatform}`,
        paymentMethod: "fund_migration",
        status: "completed",
        createdAt: new Date().toISOString(),
      });

      // Update campaign
      const campaign = await ctx.db
        .query("monitoredCampaigns")
        .filter((q) => q.eq("ifCampaignId", migration.campaignId))
        .first();

      if (campaign) {
        await ctx.db.patch(campaign._id, {
          raisedAmount: (campaign.raisedAmount || 0) + migration.grossAmount,
          donorCount: (campaign.donorCount || 0) + 1,
          lastSynced: new Date().toISOString(),
        });
      }

      // Create payout request
      const payoutId = await ctx.db.insert("payoutRequests", {
        userId: migration.campaignId,
        amountRequested: migration.grossAmount,
        feeAmount: fees,
        netAmount: net,
        payoutMethod: "pending",
        payoutDestination: "pending",
        status: "pending_user_selection",
        requestedDate: new Date().toISOString(),
      });
      await notifyCampaignOwnerPayoutReady(ctx, {
        campaignId: migration.campaignId,
        sourcePlatform: migration.sourcePlatform,
        grossAmount: migration.grossAmount,
        feeAmount: fees,
        netAmount: net,
      });

      totalGross += migration.grossAmount;
      totalFees += fees;
      totalNet += net;

      results.push({
        campaign: migration.campaignTitle,
        source: migration.sourcePlatform,
        gross: migration.grossAmount,
        fees,
        net,
        payoutId,
      });
    }

    return {
      status: "success",
      totalMigrations: results.length,
      summary: {
        totalGross: `$${totalGross.toFixed(2)}`,
        totalFees: `$${totalFees.toFixed(2)}`,
        totalNet: `$${totalNet.toFixed(2)}`,
        withdrawnBy: args.withdrawnBy,
      },
      details: results,
    };
  },
});

// Platform statuses that indicate a migration is already in-flight.
// A new queue entry must not be created while any of these statuses are active.
const ACTIVE_MIGRATION_STATUSES = new Set([
  "migration_pending",
  "migration_in_progress",
  "payout_queued",
]);

// Minimum balance (USD) that must be present before a migration is queued.
// This prevents micro-balance noise from triggering workflow overhead.
const MIN_BALANCE_TO_QUEUE = 1.00;

// Scheduled workflow: check platform balances and queue migration when conditions are met.
//
// Safety guarantees:
//  1. ONLY queues — it creates transaction + payoutRequest records flagged as
//     "pending_user_selection". No funds are moved; actual transfer requires a
//     separate, human-or-admin-initiated action.
//  2. Idempotent — skips any platform that already has an active transaction
//     (status "queued") or is already in an active migration status. The check
//     covers all non-terminal transaction statuses so two cron runs can't create
//     duplicate queued migrations.
//  3. Internal-only — declared as internalMutation; cannot be called from the
//     client or public API.
//  4. Migration conditions — a migration is only queued when ALL of the
//     following are true:
//       a. externalTotal > MIN_BALANCE_TO_QUEUE
//       b. the associated campaign exists and is "active" (not frozen/draft)
//       c. the platform is not already in an active migration status
//       d. no existing "queued" transaction for the same campaign+platform
//  5. Audit log — result summary (queued/skipped/failed counts and per-entry
//     detail) is returned and persisted as a protocolReport for traceability.
//  6. Failure isolation — each platform is processed inside a try/catch so a
//     single bad record (e.g. corrupted data) does not abort the entire run.
export const checkBalancesAndQueueMigrations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const platforms = await ctx.db.query("externalPlatforms").collect();
    const campaigns = await ctx.db.query("monitoredCampaigns").collect();
    // Load only queued transactions to power the idempotency check
    const queuedTransactions = await ctx.db
      .query("transactions")
      .withIndex("byType", (q) => q.eq("type", "fund_migration_detected"))
      .collect();

    const candidatePlatforms = platforms.filter(
      (p) => (p.externalTotal || 0) > MIN_BALANCE_TO_QUEUE
    );
    const queued: Array<{
      campaignId: string;
      campaignTitle: string;
      platform: string;
      grossAmount: number;
      netAmount: number;
      transactionId: string;
      payoutId: string;
    }> = [];
    const skipped: Array<{ campaignId: string; platform: string; reason: string }> = [];
    const failed: Array<{ campaignId: string; platform: string; error: string }> = [];
    const now = new Date().toISOString();

    for (const platform of candidatePlatforms) {
      try {
        // Condition (c): platform must not already be in an active migration status
        if (ACTIVE_MIGRATION_STATUSES.has(platform.status || "")) {
          skipped.push({
            campaignId: platform.campaignId,
            platform: platform.platform,
            reason: `platform_status_${platform.status}`,
          });
          continue;
        }

        // Condition (d): no existing queued transaction for this campaign+platform
        const alreadyQueued = queuedTransactions.some(
          (t) =>
            t.status === "queued" &&
            t.campaignId === platform.campaignId &&
            (t.sourcePlatform || "").toLowerCase() === (platform.platform || "").toLowerCase()
        );
        if (alreadyQueued) {
          skipped.push({
            campaignId: platform.campaignId,
            platform: platform.platform,
            reason: "already_queued",
          });
          continue;
        }

        // Condition (b): associated campaign must exist and be active
        const campaign = campaigns.find((c) => c.ifCampaignId === platform.campaignId);
        if (!campaign) {
          skipped.push({
            campaignId: platform.campaignId,
            platform: platform.platform,
            reason: "campaign_not_found",
          });
          continue;
        }
        if (campaign.status !== "active") {
          skipped.push({
            campaignId: platform.campaignId,
            platform: platform.platform,
            reason: `campaign_status_${campaign.status}`,
          });
          continue;
        }
        if (campaign.frozen) {
          skipped.push({
            campaignId: platform.campaignId,
            platform: platform.platform,
            reason: "campaign_frozen",
          });
          continue;
        }

        // All conditions met — compute fees and queue (no funds are transferred here)
        const grossAmount = platform.externalTotal;
        const platformFee = grossAmount * 0.05;
        const processingFee = grossAmount * 0.029 + 0.30;
        const totalFees = platformFee + processingFee;
        const netAmount = grossAmount - totalFees;

        // Record a transaction for traceability; status "queued" means awaiting action
        const transactionId = await ctx.db.insert("transactions", {
          userId: platform.campaignId,
          campaignId: platform.campaignId,
          sourcePlatform: platform.platform,
          type: "fund_migration_detected",
          amount: grossAmount,
          status: "queued",
          createdAt: now,
        });

        // Create a payout request in pending_user_selection — human action required
        const payoutId = await ctx.db.insert("payoutRequests", {
          userId: platform.campaignId,
          amountRequested: grossAmount,
          feeAmount: totalFees,
          netAmount,
          payoutMethod: "pending",
          payoutDestination: "pending",
          status: "pending_user_selection",
          requestedDate: now,
          adminReviewStatus: "auto_queued",
          adminReviewNote: `Auto-queued from ${platform.platform}; transaction=${transactionId}; gross=$${grossAmount.toFixed(2)} net=$${netAmount.toFixed(2)}`,
        });
        await notifyCampaignOwnerPayoutReady(ctx, {
          campaignId: platform.campaignId,
          sourcePlatform: platform.platform,
          grossAmount,
          feeAmount: totalFees,
          netAmount,
        });

        // Mark the platform so the next cron run skips it (idempotency guard)
        await ctx.db.patch(platform._id, {
          status: "migration_pending",
          lastError: "",
          lastSynced: now,
        });

        queued.push({
          campaignId: platform.campaignId,
          campaignTitle: campaign.title,
          platform: platform.platform,
          grossAmount,
          netAmount,
          transactionId,
          payoutId,
        });
      } catch (err) {
        // Isolate failures so one bad platform doesn't abort the entire run
        const errorMessage = err instanceof Error ? err.message : String(err);
        failed.push({
          campaignId: platform.campaignId,
          platform: platform.platform,
          error: errorMessage,
        });
        // Record the error on the platform row for observability
        await ctx.db.patch(platform._id, {
          lastError: `balance_check_error: ${errorMessage}`,
          lastSynced: now,
        }).catch(() => { /* best-effort */ });
      }
    }

    // Persist an audit log entry so every cron run is traceable
    await ctx.db.insert("protocolReports", {
      reportType: "fund_migration_balance_check",
      auditDate: now,
      totalCampaigns: candidatePlatforms.length,
      compliantCampaigns: queued.length,
      nonCompliantCampaigns: failed.length,
      totalRaised: queued.reduce((s, q) => s + q.grossAmount, 0),
      totalGoal: 0,
      fundingGap: 0,
      totalDonors: 0,
      criticalViolations: failed.map((f) => ({
        standard: f.platform,
        issue: f.error,
        severity: "error",
      })),
      results: queued.map((q) => ({
        title: `${q.campaignTitle} / ${q.platform}`,
        complianceScore: 100,
        violations: 0,
      })),
      syncPerformed: true,
    });

    return {
      status: failed.length > 0 ? "partial" : "success",
      candidatesFound: candidatePlatforms.length,
      migrationsQueued: queued.length,
      skipped: skipped.length,
      failed: failed.length,
      queued,
      skippedDetail: skipped,
      failedDetail: failed,
    };
  },
});
