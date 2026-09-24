/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { mutation, query } from "./_generated/server";
import { validateDonation, checkRateLimit } from "./security";
import { v } from "convex/values";
import { buildPayPalCheckoutUrl, createPayPalConfirmationPlan } from "./paypalCheckoutLogic";

// Create a PayPal checkout session (returns redirect URL)
export const createCheckoutSession = mutation({
  args: {
    campaignId: v.string(),
    campaignTitle: v.string(),
    amount: v.number(),
    donorName: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    checkRateLimit("checkout_write", 10, 60000); // Max 10 per minute
    if (!validateDonation(args.amount || 0)) {
      throw new Error("Invalid donation amount.");
    }
    // Record the pending donation
    const donationId = await ctx.db.insert("donations", {
      campaignId: args.campaignId,
      campaignTitle: args.campaignTitle,
      amount: args.amount,
      donorName: args.donorName,
      message: args.message || "",
      paymentMethod: "paypal",
      provider: "paypal",
      currency: "USD",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // PayPal Donate URL (simplest integration - no SDK needed)
    // Business account: interplanetarysister@gmail.com
    return {
      donationId,
      checkoutUrl: buildPayPalCheckoutUrl({
        business: "interplanetarysister@gmail.com",
        campaignTitle: args.campaignTitle,
        amount: args.amount,
        donationId,
      }),
    };
  },
});

// Confirm a PayPal donation after payment (called by IPN or return URL)
export const confirmDonation = mutation({
  args: {
    donationId: v.string(),
    paypalTransactionId: v.string(),
  },
  handler: async (ctx, args) => {
    checkRateLimit("checkout_write", 10, 60000); // Max 10 per minute
    const paypalTransactionId = args.paypalTransactionId.trim();
    if (!paypalTransactionId) {
      throw new Error("PayPal transaction ID is required.");
    }
    const now = new Date().toISOString();
    const donation = await ctx.db.get(args.donationId);
    const campaign = await ctx.db
      .query("monitoredCampaigns")
      .withIndex("byIfId", (q) => q.eq("ifCampaignId", donation?.campaignId || ""))
      .first();
    const feeConfig = await ctx.db.query("feeConfig").filter((q) => q.eq("active", true)).first();
    const confirmationPlan = createPayPalConfirmationPlan({
      donation,
      campaign,
      paypalTransactionId,
      now,
      feeConfig,
    });

    if (Object.keys(confirmationPlan.donationPatch).length > 0) {
      await ctx.db.patch(args.donationId, confirmationPlan.donationPatch);
    }

    if (campaign && confirmationPlan.campaignPatch) {
      await ctx.db.patch(campaign._id, confirmationPlan.campaignPatch);
    }

    if (confirmationPlan.transactionRecord) {
      await ctx.db.insert("transactions", confirmationPlan.transactionRecord);
    }

    return {
      status: "success",
      alreadyConfirmed: confirmationPlan.alreadyConfirmed,
      summary: confirmationPlan.summary,
    };
  },
});

// Get donation history for a campaign
export const getDonations = query({
  args: { campaignId: v.string() },
  handler: async (ctx, args) => {
    checkRateLimit("checkout_read", 60, 60000); // Max 60 reads per minute
    return await ctx.db
      .query("donations")
      .withIndex("byCampaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();
  },
});
