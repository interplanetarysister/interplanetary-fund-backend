/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { checkRateLimit, validateDonation } from "./security";

const USD_CURRENCY = "USD";
const BTC_CURRENCY = "BTC";
const SATOSHIS_PER_BTC = 100_000_000;
const ONE_SATOSHI_BTC = 1 / SATOSHIS_PER_BTC;

type PaymentMethod = "paypal" | "cashapp" | "bitcoin";

type PaymentConfig = {
  paypalBusinessEmail?: string;
  cashappCashtag?: string;
  bitcoinAddress?: string;
  bitcoinRequiredConfirmations: number;
  bitcoinExpiryMinutes: number;
  bitcoinVerifyMaxRetries: number;
  bitcoinVerifyBaseBackoffSeconds: number;
  exchangeRateCacheTtlSeconds: number;
  blockchainApiBaseUrl: string;
};

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPaymentConfig(): PaymentConfig {
  return {
    paypalBusinessEmail: process.env.PAYPAL_BUSINESS_EMAIL,
    cashappCashtag: process.env.CASHAPP_CASHTAG,
    bitcoinAddress: process.env.BITCOIN_DONATION_ADDRESS,
    bitcoinRequiredConfirmations: getNumberEnv("BITCOIN_REQUIRED_CONFIRMATIONS", 3),
    bitcoinExpiryMinutes: getNumberEnv("BITCOIN_PAYMENT_EXPIRY_MINUTES", 45),
    bitcoinVerifyMaxRetries: getNumberEnv("BITCOIN_VERIFY_MAX_RETRIES", 8),
    bitcoinVerifyBaseBackoffSeconds: getNumberEnv("BITCOIN_VERIFY_BASE_BACKOFF_SECONDS", 30),
    exchangeRateCacheTtlSeconds: getNumberEnv("BTC_RATE_CACHE_TTL_SECONDS", 300),
    blockchainApiBaseUrl: process.env.BLOCKCHAIN_API_BASE_URL || "https://blockstream.info/api",
  };
}

function getEnabledMethods(config: PaymentConfig) {
  const methods: Array<{ method: PaymentMethod; provider: string; configured: boolean; mode: "direct" | "external_link" | "onchain"; notes?: string }> = [
    {
      method: "paypal",
      provider: "paypal",
      configured: Boolean(config.paypalBusinessEmail),
      mode: "external_link",
    },
    {
      method: "cashapp",
      provider: "cashapp",
      configured: Boolean(config.cashappCashtag),
      mode: "external_link",
      notes: "Cash App is link-based and is not auto-confirmed without provider verification.",
    },
    {
      method: "bitcoin",
      provider: "bitcoin",
      configured: Boolean(config.bitcoinAddress),
      mode: "onchain",
    },
  ];

  return methods;
}

function createPaymentReference() {
  return `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getBitcoinUri(address: string, btcAmount: number, reference: string, campaignTitle: string) {
  const params = new URLSearchParams({
    amount: btcAmount.toFixed(8),
    label: `Interplanetary Fund - ${campaignTitle}`,
    message: `Donation reference ${reference}`,
  });
  return `bitcoin:${address}?${params.toString()}`;
}

async function getUsdBtcRate(ctx: any, config: PaymentConfig) {
  const now = Date.now();
  const existing = await ctx.db
    .query("exchangeRateCache")
    .withIndex("byPair", (q: any) => q.eq("pair", "USD_BTC"))
    .first();

  if (existing) {
    const expiry = Date.parse(existing.expiresAt);
    if (Number.isFinite(expiry) && expiry > now) {
      return {
        rate: existing.rate,
        source: existing.source,
        fetchedAt: existing.fetchedAt,
      };
    }
  }

  const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
  if (!response.ok) {
    throw new Error("Exchange rate unavailable. Please try again shortly.");
  }

  const body = await response.json();
  const usdPerBtc = Number(body?.bitcoin?.usd);
  if (!Number.isFinite(usdPerBtc) || usdPerBtc <= 0) {
    throw new Error("Exchange rate unavailable. Please try again shortly.");
  }

  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(now + config.exchangeRateCacheTtlSeconds * 1000).toISOString();
  if (existing) {
    await ctx.db.patch(existing._id, {
      rate: usdPerBtc,
      source: "coingecko",
      fetchedAt,
      expiresAt,
    });
  } else {
    await ctx.db.insert("exchangeRateCache", {
      pair: "USD_BTC",
      rate: usdPerBtc,
      source: "coingecko",
      fetchedAt,
      expiresAt,
    });
  }

  return {
    rate: usdPerBtc,
    source: "coingecko",
    fetchedAt,
  };
}

async function applyDonationConfirmation(ctx: any, donation: any, providerTransactionId?: string) {
  if (donation.confirmedAt) {
    return { status: "already_confirmed" };
  }

  const feeConfig = await ctx.db.query("feeConfig").filter((q: any) => q.eq("active", true)).first();
  const platformFeePercentSnapshot = feeConfig?.platformFeePercent ?? 5;
  const processingFeePercentSnapshot = feeConfig?.processingFeePercent ?? 2.9;
  const processingFeeFlatSnapshot = feeConfig?.processingFeeFlat ?? 0.30;

  const now = new Date().toISOString();
  await ctx.db.patch(donation._id, {
    status: "confirmed",
    cleared: true,
    platformFeePercentSnapshot,
    processingFeePercentSnapshot,
    processingFeeFlatSnapshot,
    feeDeductionTiming: "payout_time",
    confirmedAt: now,
    providerTransactionId: providerTransactionId || donation.providerTransactionId,
    updatedAt: now,
  });

  const campaign = await ctx.db
    .query("monitoredCampaigns")
    .withIndex("byIfId", (q: any) => q.eq("ifCampaignId", donation.campaignId))
    .first();

  if (campaign) {
    await ctx.db.patch(campaign._id, {
      raisedAmount: (campaign.raisedAmount || 0) + donation.amount,
      donorCount: (campaign.donorCount || 0) + 1,
    });
  }

  await ctx.db.insert("transactions", {
    userId: donation.campaignId,
    type: "donation_received",
    amount: donation.amount,
    sourcePlatform: donation.provider,
    campaignId: donation.campaignId,
    status: "confirmed",
    createdAt: now,
    paymentMethod: donation.paymentMethod,
    paymentProvider: donation.provider,
    currency: donation.currency || USD_CURRENCY,
    providerTransactionId: providerTransactionId || donation.providerTransactionId,
    donationId: donation._id,
    paymentReference: donation.paymentReference,
    platformFeePercentSnapshot,
    processingFeePercentSnapshot,
    processingFeeFlatSnapshot,
    feeDeductionTiming: "payout_time",
  });

  return { status: "confirmed" };
}

export const getAvailablePaymentMethods = query({
  args: {},
  handler: async () => {
    const config = getPaymentConfig();
    const methods = getEnabledMethods(config);

    return {
      methods,
      hasConfiguredMethods: methods.some((m) => m.configured),
    };
  },
});

export const createDonationIntent = mutation({
  args: {
    campaignId: v.string(),
    campaignTitle: v.string(),
    amountUSD: v.number(),
    donorName: v.optional(v.string()),
    message: v.optional(v.string()),
    paymentMethod: v.union(v.literal("paypal"), v.literal("cashapp"), v.literal("bitcoin")),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    checkRateLimit("donation_intent", 20, 60000);

    if (!validateDonation(args.amountUSD)) {
      throw new Error("Invalid donation amount. Must be between $0.01 and $100,000.");
    }

    const config = getPaymentConfig();
    const enabledMethods = getEnabledMethods(config);
    const selected = enabledMethods.find((m) => m.method === args.paymentMethod);

    if (!selected?.configured) {
      throw new Error(`Payment method '${args.paymentMethod}' is not configured.`);
    }

    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("donations")
        .withIndex("byIdempotencyKey", (q: any) => q.eq("idempotencyKey", args.idempotencyKey))
        .first();
      if (existing) {
        return {
          donationId: existing._id,
          paymentReference: existing.paymentReference,
          status: existing.status,
          paymentMethod: existing.paymentMethod,
          checkout: existing.checkout,
          bitcoin: existing.bitcoin,
          idempotentReplay: true,
        };
      }
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const paymentReference = createPaymentReference();

    const baseDonation: any = {
      campaignId: args.campaignId,
      campaignTitle: args.campaignTitle,
      amount: args.amountUSD,
      donorName: args.donorName || "Anonymous",
      message: args.message || "",
      paymentMethod: args.paymentMethod,
      provider: selected.provider,
      currency: USD_CURRENCY,
      status: args.paymentMethod === "bitcoin" ? "created" : "pending",
      createdAt,
      updatedAt: createdAt,
      paymentReference,
      idempotencyKey: args.idempotencyKey,
      expiresAt: new Date(now.getTime() + getNumberEnv("DONATION_INTENT_EXPIRY_MINUTES", 60) * 60_000).toISOString(),
    };

    let checkout: any;
    let bitcoin: any;

    if (args.paymentMethod === "paypal") {
      const paypalBusinessEmail = config.paypalBusinessEmail!;
      const paypalUrl = new URL("https://www.paypal.com/donate");
      paypalUrl.searchParams.set("cmd", "_donations");
      paypalUrl.searchParams.set("business", paypalBusinessEmail);
      paypalUrl.searchParams.set("item_name", `${args.campaignTitle} - Interplanetary Fund`);
      paypalUrl.searchParams.set("amount", args.amountUSD.toFixed(2));
      paypalUrl.searchParams.set("currency_code", "USD");
      paypalUrl.searchParams.set("custom", paymentReference);
      checkout = {
        url: paypalUrl.toString(),
      };
      baseDonation.checkout = checkout;
    }

    if (args.paymentMethod === "cashapp") {
      const cashtag = (config.cashappCashtag || "").replace(/^\$/, "");
      const cashAppUrl = `https://cash.app/$${cashtag}/${args.amountUSD.toFixed(2)}`;
      checkout = {
        url: cashAppUrl,
      };
      baseDonation.checkout = checkout;
    }

    if (args.paymentMethod === "bitcoin") {
      const bitcoinAddress = config.bitcoinAddress;
      if (!bitcoinAddress) {
        throw new Error("Bitcoin donation address is not configured.");
      }

      const rate = await getUsdBtcRate(ctx, config);
      const btcAmount = Number((args.amountUSD / rate.rate).toFixed(8));
      const expiresAt = new Date(now.getTime() + config.bitcoinExpiryMinutes * 60_000).toISOString();
      const paymentUri = getBitcoinUri(bitcoinAddress, btcAmount, paymentReference, args.campaignTitle);

      bitcoin = {
        status: "awaiting_payment",
        address: bitcoinAddress,
        btcAmount,
        usdAmount: args.amountUSD,
        exchangeRate: rate.rate,
        exchangeRateSource: rate.source,
        exchangeRateTimestamp: rate.fetchedAt,
        requiredConfirmations: config.bitcoinRequiredConfirmations,
        confirmations: 0,
        expiresAt,
        paymentUri,
        verificationAttempts: 0,
        nextVerificationAt: createdAt,
      };

      baseDonation.status = "awaiting_payment";
      baseDonation.expiresAt = expiresAt;
      baseDonation.bitcoin = bitcoin;
    }

    const donationId = await ctx.db.insert("donations", baseDonation);

    return {
      donationId,
      paymentReference,
      status: baseDonation.status,
      paymentMethod: args.paymentMethod,
      checkout,
      bitcoin,
      idempotentReplay: false,
    };
  },
});

export const recordPayPalPaymentSuccess = internalMutation({
  args: {
    paymentReference: v.string(),
    currency: v.string(),
    amount: v.number(),
    donorName: v.optional(v.string()),
    receiverEmail: v.optional(v.string()),
    providerTransactionId: v.string(),
  },
  handler: async (ctx, args) => {
    checkRateLimit("confirm_external_donation", 20, 60000);

    if (!validateDonation(args.amount)) {
      throw new Error("Invalid donation amount. Must be between $0.01 and $100,000.");
    }

    const paymentReference = args.paymentReference.trim();
    if (!paymentReference) {
      throw new Error("Payment reference is required.");
    }

    const providerTransactionId = args.providerTransactionId.trim();
    if (!providerTransactionId) {
      throw new Error("PayPal transaction ID is required.");
    }

    const callbackCurrency = args.currency.trim().toUpperCase();
    if (callbackCurrency !== USD_CURRENCY) {
      throw new Error("Unsupported donation currency for PayPal callback.");
    }

    const paypalBusinessEmail = (process.env.PAYPAL_BUSINESS_EMAIL || "").trim().toLowerCase();
    const receiverEmail = (args.receiverEmail || "").trim().toLowerCase();
    if (paypalBusinessEmail && receiverEmail && receiverEmail !== paypalBusinessEmail) {
      throw new Error("PayPal receiver email mismatch.");
    }

    const donation = await ctx.db
      .query("donations")
      .withIndex("byPaymentReference", (q: any) => q.eq("paymentReference", paymentReference))
      .first();

    if (!donation) {
      throw new Error("Donation intent not found for payment reference.");
    }

    if (donation.paymentMethod !== "paypal" || donation.provider !== "paypal") {
      throw new Error("Payment reference is not a PayPal donation intent.");
    }

    const duplicate = await ctx.db
      .query("donations")
      .withIndex("byProviderTransactionId", (q: any) => q.eq("providerTransactionId", providerTransactionId))
      .first();

    if (duplicate && duplicate._id !== donation._id) {
      return {
        status: "duplicate_transaction",
        duplicateDonationId: duplicate._id,
      };
    }

    if (donation.confirmedAt) {
      if (donation.providerTransactionId && donation.providerTransactionId !== providerTransactionId) {
        throw new Error("Donation already confirmed with a different PayPal transaction ID.");
      }
      return { status: "already_confirmed", donationId: donation._id };
    }

    const storedCurrency = (donation.currency || USD_CURRENCY).toUpperCase();
    if (storedCurrency !== callbackCurrency) {
      throw new Error("PayPal callback currency does not match donation intent.");
    }

    if (Math.abs((donation.amount || 0) - args.amount) > 0.009) {
      throw new Error("PayPal callback amount does not match donation intent.");
    }

    const donorName = args.donorName?.trim();
    if (donorName && donorName !== donation.donorName) {
      await ctx.db.patch(donation._id, {
        donorName,
        updatedAt: new Date().toISOString(),
      });
    }

    const latestDonation = await ctx.db.get(donation._id);
    const result = await applyDonationConfirmation(ctx, latestDonation, providerTransactionId);

    return {
      status: result.status,
      donationId: donation._id,
    };
  },
});

export const confirmExternalDonation = internalMutation({
  args: {
    donationId: v.id("donations"),
    providerTransactionId: v.string(),
    status: v.union(v.literal("confirmed"), v.literal("failed"), v.literal("refunded")),
  },
  handler: async (ctx, args) => {
    checkRateLimit("confirm_external_donation", 20, 60000);

    const duplicate = await ctx.db
      .query("donations")
      .withIndex("byProviderTransactionId", (q: any) => q.eq("providerTransactionId", args.providerTransactionId))
      .first();

    if (duplicate && duplicate._id !== args.donationId) {
      return {
        status: "duplicate_transaction",
        duplicateDonationId: duplicate._id,
      };
    }

    const donation = await ctx.db.get(args.donationId);
    if (!donation) {
      throw new Error("Donation not found.");
    }

    if (args.status === "confirmed") {
      const result = await applyDonationConfirmation(ctx, donation, args.providerTransactionId);
      return { status: result.status };
    }

    await ctx.db.patch(donation._id, {
      status: args.status,
      providerTransactionId: args.providerTransactionId,
      updatedAt: new Date().toISOString(),
    });

    return { status: args.status };
  },
});

async function getTipHeight(baseUrl: string): Promise<number | null> {
  const resp = await fetch(`${baseUrl}/blocks/tip/height`);
  if (!resp.ok) return null;
  const text = await resp.text();
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function getOutputForAddress(tx: any, address: string): { valueBtc: number; valueSats: number } | null {
  const outputs = Array.isArray(tx?.vout) ? tx.vout : [];
  for (const output of outputs) {
    if (output?.scriptpubkey_address === address && typeof output.value === "number") {
      return {
        valueSats: output.value,
        valueBtc: output.value / SATOSHIS_PER_BTC,
      };
    }
  }
  return null;
}

function getConfirmations(tx: any, tipHeight: number | null) {
  if (!tx?.status?.confirmed || typeof tx?.status?.block_height !== "number" || !tipHeight) {
    return 0;
  }
  return Math.max(0, tipHeight - tx.status.block_height + 1);
}

function getBackoffSeconds(attempts: number, baseBackoffSeconds: number) {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(baseBackoffSeconds * Math.pow(2, exponent), 3600);
}

export const verifyBitcoinDonation = mutation({
  args: {
    donationId: v.id("donations"),
  },
  handler: async (ctx, args) => {
    checkRateLimit("verify_bitcoin", 30, 60000);

    const donation = await ctx.db.get(args.donationId);
    if (!donation) {
      throw new Error("Donation not found.");
    }
    if (donation.paymentMethod !== "bitcoin") {
      throw new Error("Donation is not a Bitcoin payment.");
    }

    const config = getPaymentConfig();
    const bitcoinAddress = donation?.bitcoin?.address || config.bitcoinAddress;
    if (!bitcoinAddress) {
      throw new Error("Bitcoin donation address is not configured.");
    }

    const now = Date.now();
    const expiresAtMs = Date.parse(donation.expiresAt || donation?.bitcoin?.expiresAt || "");
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= now) {
      await ctx.db.patch(donation._id, {
        status: "expired",
        updatedAt: new Date().toISOString(),
      });
      return { status: "expired" };
    }

    if (donation.status === "confirmed") {
      return {
        status: "confirmed",
        confirmations: donation?.bitcoin?.confirmations || 0,
        txHash: donation?.bitcoin?.txHash || null,
      };
    }

    const attempts = donation?.bitcoin?.verificationAttempts || 0;
    if (attempts >= config.bitcoinVerifyMaxRetries) {
      await ctx.db.patch(donation._id, {
        status: "failed",
        updatedAt: new Date().toISOString(),
      });
      return { status: "failed", reason: "max_verification_retries" };
    }

    const nextVerificationAt = Date.parse(donation?.bitcoin?.nextVerificationAt || "");
    if (Number.isFinite(nextVerificationAt) && now < nextVerificationAt) {
      return {
        status: donation.status,
        nextVerificationAt: donation?.bitcoin?.nextVerificationAt,
        cached: true,
      };
    }

    const baseUrl = config.blockchainApiBaseUrl.replace(/\/$/, "");
    let candidateTx: any | null = null;

    if (donation?.bitcoin?.txHash) {
      const txResp = await fetch(`${baseUrl}/tx/${donation.bitcoin.txHash}`);
      if (txResp.ok) {
        candidateTx = await txResp.json();
      }
    } else {
      const txsResp = await fetch(`${baseUrl}/address/${bitcoinAddress}/txs`);
      if (txsResp.ok) {
        const txs = await txsResp.json();
        const expectedSats = Math.floor((donation?.bitcoin?.btcAmount || 0) * SATOSHIS_PER_BTC);

        if (Array.isArray(txs)) {
          for (const tx of txs) {
            const out = getOutputForAddress(tx, bitcoinAddress);
            if (!out) continue;
            if (out.valueSats < expectedSats) continue;

            const duplicateHash = await ctx.db
              .query("donations")
              .withIndex("byBitcoinTxHash", (q: any) => q.eq("bitcoinTxHash", tx.txid))
              .first();

            if (duplicateHash && duplicateHash._id !== donation._id) {
              continue;
            }

            candidateTx = tx;
            break;
          }
        }
      }
    }

    const newAttempts = attempts + 1;
    const backoffSeconds = getBackoffSeconds(newAttempts, config.bitcoinVerifyBaseBackoffSeconds);
    const nowIso = new Date().toISOString();
    const nextIso = new Date(now + backoffSeconds * 1000).toISOString();

    if (!candidateTx) {
      await ctx.db.patch(donation._id, {
        status: "awaiting_payment",
        updatedAt: nowIso,
        bitcoin: {
          ...donation.bitcoin,
          status: "awaiting_payment",
          verificationAttempts: newAttempts,
          nextVerificationAt: nextIso,
          lastVerificationAt: nowIso,
        },
      });

      return {
        status: "awaiting_payment",
        verificationAttempts: newAttempts,
        nextVerificationAt: nextIso,
      };
    }

    const out = getOutputForAddress(candidateTx, bitcoinAddress);
    const expectedBtc = donation?.bitcoin?.btcAmount || 0;
    const duplicateHash = await ctx.db
      .query("donations")
      .withIndex("byBitcoinTxHash", (q: any) => q.eq("bitcoinTxHash", candidateTx.txid))
      .first();

    if (duplicateHash && duplicateHash._id !== donation._id) {
      await ctx.db.patch(donation._id, {
        status: "awaiting_payment",
        updatedAt: nowIso,
        bitcoinTxHash: candidateTx.txid,
        bitcoin: {
          ...donation.bitcoin,
          status: "awaiting_payment",
          txHash: candidateTx.txid,
          verificationAttempts: newAttempts,
          nextVerificationAt: nextIso,
          lastVerificationAt: nowIso,
          failureReason: "duplicate_blockchain_tx",
        },
      });
      return {
        status: "awaiting_payment",
        reason: "duplicate_blockchain_tx",
        txHash: candidateTx.txid,
      };
    }

    if (!out || out.valueBtc + ONE_SATOSHI_BTC < expectedBtc) {
      await ctx.db.patch(donation._id, {
        status: "failed",
        updatedAt: nowIso,
        bitcoinTxHash: candidateTx.txid,
        bitcoin: {
          ...donation.bitcoin,
          status: "failed",
          txHash: candidateTx.txid,
          verificationAttempts: newAttempts,
          nextVerificationAt: nextIso,
          lastVerificationAt: nowIso,
          detectedBtcAmount: out?.valueBtc || 0,
          failureReason: "insufficient_amount",
        },
      });

      return {
        status: "failed",
        reason: "insufficient_amount",
        txHash: candidateTx.txid,
        expectedBtc,
        detectedBtc: out?.valueBtc || 0,
      };
    }

    const tipHeight = await getTipHeight(baseUrl);
    const confirmations = getConfirmations(candidateTx, tipHeight);
    const requiredConfirmations = donation?.bitcoin?.requiredConfirmations || config.bitcoinRequiredConfirmations;

    const nextStatus = confirmations >= requiredConfirmations ? "confirmed" : "confirming";

    await ctx.db.patch(donation._id, {
      status: nextStatus,
      bitcoinTxHash: candidateTx.txid,
      updatedAt: nowIso,
      bitcoin: {
        ...donation.bitcoin,
        status: nextStatus,
        txHash: candidateTx.txid,
        confirmations,
        requiredConfirmations,
        verificationAttempts: newAttempts,
        nextVerificationAt: nextIso,
        lastVerificationAt: nowIso,
        detectedBtcAmount: out.valueBtc,
      },
    });

    if (nextStatus === "confirmed") {
      const patchedDonation = await ctx.db.get(donation._id);
      await applyDonationConfirmation(ctx, patchedDonation, candidateTx.txid);
    }

    return {
      status: nextStatus,
      txHash: candidateTx.txid,
      confirmations,
      requiredConfirmations,
      nextVerificationAt: nextIso,
      verificationAttempts: newAttempts,
    };
  },
});

export const getDonationStatus = query({
  args: {
    donationId: v.id("donations"),
  },
  handler: async (ctx, args) => {
    const donation = await ctx.db.get(args.donationId);
    if (!donation) {
      throw new Error("Donation not found.");
    }

    return {
      donationId: donation._id,
      paymentMethod: donation.paymentMethod,
      provider: donation.provider,
      amount: donation.amount,
      currency: donation.currency || USD_CURRENCY,
      status: donation.status,
      paymentReference: donation.paymentReference,
      providerTransactionId: donation.providerTransactionId || donation.bitcoinTxHash || null,
      createdAt: donation.createdAt,
      confirmedAt: donation.confirmedAt || null,
      expiresAt: donation.expiresAt || null,
      bitcoin: donation.bitcoin || null,
    };
  },
});
