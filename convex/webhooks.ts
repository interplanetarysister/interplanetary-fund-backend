/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { httpAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// =====================================================
// WEBHOOK INGEST HANDLERS
// Receives real-time donation events from external platforms.
// Route wiring lives in convex/http.ts.
//
// Security contract for every handler:
//   1. Validate platform signature / token before writing data.
//   2. Return 200 OK immediately (queue failures; never return 5xx
//      to external callers — that triggers infinite retries).
//   3. Use providerTransactionId for idempotency deduplication.
// =====================================================

// ---------------------------------------------------------------------------
// Internal mutation: record an inbound donation from any webhook source.
// Performs idempotency check via providerTransactionId before writing.
// ---------------------------------------------------------------------------
export const recordInboundDonation = internalMutation({
  args: {
    campaignId: v.string(),
    grossAmount: v.number(),
    donorName: v.string(),
    currency: v.string(),
    platform: v.string(),
    providerTransactionId: v.optional(v.string()),
    paymentMethod: v.string(),
    donorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Idempotency: skip if we already have this provider transaction
    if (args.providerTransactionId) {
      const existing = await ctx.db
        .query("transactions")
        .withIndex("byProviderTransactionId", (q) =>
          q.eq("providerTransactionId", args.providerTransactionId)
        )
        .first();
      if (existing) {
        return { status: "duplicate", transactionId: existing._id };
      }
    }

    const now = new Date().toISOString();

    // Resolve campaign (best-effort — we still record even if not found)
    const campaign = await ctx.db
      .query("monitoredCampaigns")
      .withIndex("byIfId", (q) => q.eq("ifCampaignId", args.campaignId))
      .first();

    const campaignTitle = campaign?.title ?? args.campaignId;

    // Write donations row
    const donationId = await ctx.db.insert("donations", {
      campaignId: args.campaignId,
      campaignTitle,
      amount: args.grossAmount,
      donorName: args.donorName,
      message: args.donorMessage ?? "",
      paymentMethod: args.paymentMethod,
      provider: args.platform,
      currency: args.currency,
      providerTransactionId: args.providerTransactionId,
      status: "completed",
      createdAt: now,
      confirmedAt: now,
      updatedAt: now,
    });

    // Write transaction row
    const transactionId = await ctx.db.insert("transactions", {
      userId: campaign?.ifCampaignId ?? args.campaignId,
      type: "webhook_deposit",
      amount: args.grossAmount,
      sourcePlatform: args.platform,
      campaignId: args.campaignId,
      status: "completed",
      currency: args.currency,
      providerTransactionId: args.providerTransactionId,
      donationId,
      createdAt: now,
    });

    // Calculate fees and write ledger entries
    const feeConfig = await ctx.db
      .query("feeConfig")
      .filter((q) => q.eq("active", true))
      .first();
    const platformFeePercent = feeConfig?.platformFeePercent ?? 5;
    const processingFeePercent = feeConfig?.processingFeePercent ?? 2.9;
    const processingFeeFlat = feeConfig?.processingFeeFlat ?? 0.30;

    const platformFeeAmt = args.grossAmount * (platformFeePercent / 100);
    const processingFeeAmt = args.grossAmount * (processingFeePercent / 100) + processingFeeFlat;
    const totalFees = platformFeeAmt + processingFeeAmt;
    const netAmount = args.grossAmount - totalFees;

    await ctx.db.insert("fees", {
      transactionId,
      feeType: "platform_fee",
      amount: platformFeeAmt,
      currency: args.currency,
      rateUsed: platformFeePercent / 100,
      createdAt: now,
    });
    await ctx.db.insert("fees", {
      transactionId,
      feeType: "processor_fee",
      amount: processingFeeAmt,
      currency: args.currency,
      rateUsed: processingFeePercent / 100,
      flatAmount: processingFeeFlat,
      createdAt: now,
    });

    // Write allocation row
    const holdingUserId = campaign?.ifCampaignId ?? args.campaignId;
    await ctx.db.insert("allocations", {
      transactionId,
      campaignId: args.campaignId,
      userId: holdingUserId,
      grossAmount: args.grossAmount,
      totalFees,
      netAmount,
      currency: args.currency,
      status: "allocated",
      createdAt: now,
    });

    // Update or create holding account (net amount credited)
    const existingAccount = await ctx.db
      .query("holdingAccounts")
      .withIndex("byUserId", (q) => q.eq("userId", holdingUserId))
      .first();

    if (existingAccount) {
      await ctx.db.patch(existingAccount._id, {
        totalBalance: existingAccount.totalBalance + netAmount,
        totalFeesDeducted: existingAccount.totalFeesDeducted + totalFees,
        lastUpdated: now,
      });
    } else {
      await ctx.db.insert("holdingAccounts", {
        userId: holdingUserId,
        totalBalance: netAmount,
        totalFeesDeducted: totalFees,
        totalPaidOut: 0,
        pendingPayouts: 0,
        lastUpdated: now,
      });
    }

    // Update campaign raised amount
    if (campaign) {
      await ctx.db.patch(campaign._id, {
        raisedAmount: (campaign.raisedAmount || 0) + args.grossAmount,
        donorCount: (campaign.donorCount || 0) + 1,
        lastSynced: now,
      });

      // Update externalPlatforms total for this platform+campaign pair
      const platformRecord = await ctx.db
        .query("externalPlatforms")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", args.campaignId))
        .collect();
      const matchingPlatform = platformRecord.find(
        (p) => p.platform.toLowerCase() === args.platform.toLowerCase()
      );
      if (matchingPlatform) {
        await ctx.db.patch(matchingPlatform._id, {
          externalTotal: (matchingPlatform.externalTotal || 0) + args.grossAmount,
          externalDonorCount: (matchingPlatform.externalDonorCount || 0) + 1,
          lastSynced: now,
        });
      }
    }

    return { status: "success", donationId, transactionId, netAmount };
  },
});

// ---------------------------------------------------------------------------
// PayPal IPN (Instant Payment Notification)
// Dashboard: https://developer.paypal.com → My Apps → IPN Settings
// Secret env var: PAYPAL_WEBHOOK_SECRET
// ---------------------------------------------------------------------------
export const paypalWebhook = httpAction(async (ctx, request) => {
  try {
    const body = await request.text();
    const secret = process.env.PAYPAL_WEBHOOK_SECRET;

    // Reject the request when no secret is configured — prevents open ingestion
    if (!secret) {
      console.warn("[webhooks/paypal] PAYPAL_WEBHOOK_SECRET not configured — event rejected");
      return new Response("OK", { status: 200 });
    }

    const params = new URLSearchParams(body);

    // Validate secret token (lightweight guard; full IPN verify requires a
    // back-channel POST to PayPal — add when a server-side fetch is available)
    const token = params.get("verification_token") ?? params.get("custom");
    if (token !== secret) {
      console.warn("[webhooks/paypal] Invalid token — event discarded");
      return new Response("OK", { status: 200 });
    }

    const paymentStatus = params.get("payment_status");
    if (paymentStatus !== "Completed") {
      return new Response("OK", { status: 200 });
    }

    const grossStr = params.get("mc_gross");
    const gross = grossStr ? parseFloat(grossStr) : 0;
    const campaignId = params.get("item_number") ?? "unknown";
    const firstName = params.get("first_name") ?? "";
    const lastName = params.get("last_name") ?? "";
    const donorName = [firstName, lastName].filter(Boolean).join(" ") || "PayPal Donor";
    const currency = params.get("mc_currency") ?? "USD";
    const providerTransactionId = params.get("txn_id") ?? undefined;

    if (gross > 0) {
      await ctx.runMutation(internal.webhooks.recordInboundDonation, {
        campaignId,
        grossAmount: gross,
        donorName,
        currency,
        platform: "paypal",
        providerTransactionId,
        paymentMethod: "paypal",
      });
    }
  } catch (err) {
    console.error("[webhooks/paypal] Error:", err);
  }
  return new Response("OK", { status: 200 });
});

// ---------------------------------------------------------------------------
// Ko-fi Webhook
// Dashboard: Ko-fi → Settings → API → Webhook URL
// Secret env var: KOFI_WEBHOOK_TOKEN
// ---------------------------------------------------------------------------
export const kofiWebhook = httpAction(async (ctx, request) => {
  try {
    const body = await request.text();
    let payload: Record<string, any>;
    try {
      const params = new URLSearchParams(body);
      const dataStr = params.get("data");
      payload = dataStr ? JSON.parse(decodeURIComponent(dataStr)) : JSON.parse(body);
    } catch {
      return new Response("OK", { status: 200 });
    }

    const token = process.env.KOFI_WEBHOOK_TOKEN;
    if (!token) {
      console.warn("[webhooks/kofi] KOFI_WEBHOOK_TOKEN not configured — event discarded");
      return new Response("OK", { status: 200 });
    }
    if (payload["verification_token"] !== token) {
      console.warn("[webhooks/kofi] Invalid token — event discarded");
      return new Response("OK", { status: 200 });
    }

    const type: string = payload["type"] ?? "";
    if (type !== "Donation" && type !== "Subscription") {
      return new Response("OK", { status: 200 });
    }

    const gross = parseFloat(payload["amount"] ?? "0");
    if (gross > 0) {
      await ctx.runMutation(internal.webhooks.recordInboundDonation, {
        campaignId: "kofi",
        grossAmount: gross,
        donorName: payload["from_name"] ?? "Ko-fi Supporter",
        currency: payload["currency"] ?? "USD",
        platform: "kofi",
        providerTransactionId: payload["kofi_transaction_id"],
        paymentMethod: "kofi",
        donorMessage: payload["message"],
      });
    }
  } catch (err) {
    console.error("[webhooks/kofi] Error:", err);
  }
  return new Response("OK", { status: 200 });
});

// ---------------------------------------------------------------------------
// Buy Me a Coffee Webhook
// Dashboard: BMAC → Settings → Webhooks
// Secret env var: BMAC_WEBHOOK_SECRET
// ---------------------------------------------------------------------------
export const bmacWebhook = httpAction(async (ctx, request) => {
  try {
    const body = await request.text();
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("OK", { status: 200 });
    }

    const secret = process.env.BMAC_WEBHOOK_SECRET;
    if (!secret) {
      console.warn("[webhooks/bmac] BMAC_WEBHOOK_SECRET not configured — event discarded");
      return new Response("OK", { status: 200 });
    }
    const data: Record<string, any> = payload["data"] ?? payload;
    if (data["verification_token"] !== secret) {
      console.warn("[webhooks/bmac] Invalid token — event discarded");
      return new Response("OK", { status: 200 });
    }

    const gross = parseFloat(data["total_amount"] ?? data["amount"] ?? "0");
    if (gross > 0) {
      await ctx.runMutation(internal.webhooks.recordInboundDonation, {
        campaignId: "buymeacoffee",
        grossAmount: gross,
        donorName: data["supporter_name"] ?? "BMAC Supporter",
        currency: data["currency"] ?? "USD",
        platform: "buymeacoffee",
        providerTransactionId: data["support_id"] ? String(data["support_id"]) : undefined,
        paymentMethod: "buymeacoffee",
        donorMessage: data["support_note"],
      });
    }
  } catch (err) {
    console.error("[webhooks/bmac] Error:", err);
  }
  return new Response("OK", { status: 200 });
});

// ---------------------------------------------------------------------------
// Patreon Webhook
// Dashboard: Patreon → Developer Portal → Webhooks
// Verification: HMAC-MD5 of raw body against X-Patreon-Signature header
// Secret env var: PATREON_WEBHOOK_SECRET
//
// NOTE: The Web Crypto API (crypto.subtle) does NOT support HMAC-MD5.
// Full signature verification requires a pure-JS MD5 library (e.g. @noble/hashes).
// Until that dependency is added, we perform a presence check: the secret must be
// set in the environment, and the signature header must be non-empty. This prevents
// unauthenticated requests when no secret is configured, but does not cryptographically
// validate the signature value itself. Add HMAC-MD5 verification before go-live.
// ---------------------------------------------------------------------------
export const patreonWebhook = httpAction(async (ctx, request) => {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-patreon-signature") ?? "";
    const secret = process.env.PATREON_WEBHOOK_SECRET;

    // Reject when secret is not configured — prevents open ingestion
    if (!secret) {
      console.warn("[webhooks/patreon] PATREON_WEBHOOK_SECRET not configured — event rejected");
      return new Response("OK", { status: 200 });
    }

    // Reject when Patreon sends no signature header (malformed or spoofed request)
    if (!signature) {
      console.warn("[webhooks/patreon] Missing x-patreon-signature header — event discarded");
      return new Response("OK", { status: 200 });
    }

    // TODO: Replace the block above with full HMAC-MD5 verification once a
    // pure-JS MD5 library (e.g. @noble/hashes/legacy) is added to the project.
    // Example:
    //   import { hmac } from "@noble/hashes/hmac";
    //   import { md5 } from "@noble/hashes/legacy";
    //   const computed = bytesToHex(hmac(md5, secret, body));
    //   if (computed !== signature) { ... reject ... }

    const eventType = request.headers.get("x-patreon-event") ?? "";
    if (!eventType.startsWith("pledges:")) {
      return new Response("OK", { status: 200 });
    }

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("OK", { status: 200 });
    }

    const attributes: Record<string, any> = payload["data"]?.["attributes"] ?? {};
    const gross = parseInt(attributes["amount_cents"] ?? "0", 10) / 100;
    const included: any[] = payload["included"] ?? [];
    const userEntry = included.find((i: any) => i["type"] === "user");
    const donorName = userEntry?.["attributes"]?.["full_name"] ?? "Patreon Patron";

    if (gross > 0) {
      await ctx.runMutation(internal.webhooks.recordInboundDonation, {
        campaignId: "patreon",
        grossAmount: gross,
        donorName,
        currency: attributes["currency"] ?? "USD",
        platform: "patreon",
        providerTransactionId: payload["data"]?.["id"],
        paymentMethod: "patreon",
      });
    }
  } catch (err) {
    console.error("[webhooks/patreon] Error:", err);
  }
  return new Response("OK", { status: 200 });
});
