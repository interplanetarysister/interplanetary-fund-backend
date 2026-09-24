import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPayPalCheckoutUrl,
  calculatePayPalFees,
  createPayPalConfirmationPlan,
} from "./paypalCheckoutLogic.js";

test("buildPayPalCheckoutUrl includes reconciliation fields", () => {
  const url = new URL(buildPayPalCheckoutUrl({
    business: "fund@example.com",
    campaignTitle: "Launch Campaign",
    amount: 42.5,
    donationId: "don_123",
  }));

  assert.equal(url.origin, "https://www.paypal.com");
  assert.equal(url.pathname, "/donate");
  assert.equal(url.searchParams.get("cmd"), "_donations");
  assert.equal(url.searchParams.get("business"), "fund@example.com");
  assert.equal(url.searchParams.get("item_name"), "Launch Campaign");
  assert.equal(url.searchParams.get("amount"), "42.5");
  assert.equal(url.searchParams.get("currency_code"), "USD");
  assert.equal(url.searchParams.get("custom"), "don_123");
});

test("calculatePayPalFees honors active fee config overrides", () => {
  const fees = calculatePayPalFees(100, {
    platformFeePercent: 6,
    processingFeePercent: 3.1,
    processingFeeFlat: 0.45,
  });

  assert.equal(fees.platformFee, 6);
  assert.ok(Math.abs(fees.processingFee - 3.55) < 1e-9);
  assert.ok(Math.abs(fees.netAmount - 90.45) < 1e-9);
});

test("createPayPalConfirmationPlan returns patches, transaction, and summary", () => {
  const now = "2026-08-12T00:00:00.000Z";
  const donation = {
    _id: "don_123",
    campaignId: "cmp_123",
    amount: 100,
    status: "pending",
    currency: "USD",
    paymentReference: "ref_123",
  };
  const campaign = {
    _id: "camp_1",
    raisedAmount: 25,
    donorCount: 3,
  };

  const plan = createPayPalConfirmationPlan({
    donation,
    campaign,
    paypalTransactionId: "txn_123",
    now,
    feeConfig: {
      platformFeePercent: 6,
      processingFeePercent: 3.1,
      processingFeeFlat: 0.45,
    },
  });

  assert.equal(plan.alreadyConfirmed, false);
  assert.deepEqual(plan.donationPatch, {
    status: "confirmed",
    providerTransactionId: "txn_123",
    provider: "paypal",
    updatedAt: now,
    confirmedAt: now,
  });
  assert.deepEqual(plan.campaignPatch, {
    raisedAmount: 125,
    donorCount: 4,
    lastSynced: now,
  });
  assert.deepEqual(plan.transactionRecord, {
    userId: "cmp_123",
    type: "donation_received",
    amount: 100,
    status: "confirmed",
    createdAt: now,
    paymentMethod: "paypal",
    paymentProvider: "paypal",
    currency: "USD",
    providerTransactionId: "txn_123",
    donationId: "don_123",
    paymentReference: "ref_123",
  });
  assert.deepEqual(plan.summary, {
    donation: 100,
    platformFee: "6.00",
    processingFee: "3.55",
    netAmount: "90.45",
  });
});

test("createPayPalConfirmationPlan is idempotent for already confirmed donations", () => {
  const now = "2026-08-12T00:00:00.000Z";
  const plan = createPayPalConfirmationPlan({
    donation: {
      _id: "don_123",
      campaignId: "cmp_123",
      amount: 55,
      status: "confirmed",
      providerTransactionId: "txn_123",
      confirmedAt: now,
    },
    campaign: null,
    paypalTransactionId: "txn_123",
    now,
  });

  assert.equal(plan.alreadyConfirmed, true);
  assert.deepEqual(plan.donationPatch, {});
  assert.deepEqual(plan.summary, { donation: 55 });
  assert.equal(plan.transactionRecord, undefined);
});

test("createPayPalConfirmationPlan rejects mismatched or inconsistent confirmations", () => {
  assert.throws(() => createPayPalConfirmationPlan({
    donation: {
      _id: "don_123",
      campaignId: "cmp_123",
      amount: 10,
      status: "confirmed",
      providerTransactionId: "txn_old",
    },
    campaign: null,
    paypalTransactionId: "txn_new",
    now: "2026-08-12T00:00:00.000Z",
  }), /different PayPal transaction ID/);

  assert.throws(() => createPayPalConfirmationPlan({
    donation: {
      _id: "don_123",
      campaignId: "cmp_123",
      amount: 10,
      status: "pending",
      confirmedAt: "2026-08-11T00:00:00.000Z",
    },
    campaign: null,
    paypalTransactionId: "txn_new",
    now: "2026-08-12T00:00:00.000Z",
  }), /state is inconsistent/);
});
