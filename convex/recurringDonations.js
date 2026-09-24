/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

const UNIT_LABELS = {
  D: ["day", "days"],
  W: ["week", "weeks"],
  M: ["month", "months"],
  Y: ["year", "years"],
};

export const PAYPAL_SUBSCRIPTION_MANAGE_URL = "https://www.paypal.com/myaccount/autopay/";

export function getRecurringFrequencyLabel(intervalCount, intervalUnit) {
  if (intervalCount === 1 && intervalUnit === "M") return "Monthly";
  if (intervalCount === 3 && intervalUnit === "M") return "Quarterly";
  if (intervalCount === 1 && intervalUnit === "Y") return "Yearly";
  const [singular, plural] = UNIT_LABELS[intervalUnit] || ["interval", "intervals"];
  return `Every ${intervalCount} ${intervalCount === 1 ? singular : plural}`;
}

export function normalizeRecurringPlan(recurring) {
  if (!recurring) return null;

  const intervalCount = Math.max(1, Math.min(24, Math.floor(Number(recurring.intervalCount) || 1)));
  const intervalUnit = recurring.intervalUnit;

  if (!["D", "W", "M", "Y"].includes(intervalUnit)) {
    throw new Error("Unsupported recurring donation interval.");
  }

  return {
    intervalCount,
    intervalUnit,
    label: recurring.label?.trim() || getRecurringFrequencyLabel(intervalCount, intervalUnit),
  };
}

export function buildPayPalSubscriptionUrl({
  businessEmail,
  campaignTitle,
  amountUSD,
  paymentReference,
  returnUrl,
  cancelUrl,
  recurringPlan,
}) {
  const paypalUrl = new URL("https://www.paypal.com/cgi-bin/webscr");
  paypalUrl.searchParams.set("cmd", "_xclick-subscriptions");
  paypalUrl.searchParams.set("business", businessEmail);
  paypalUrl.searchParams.set("item_name", `${campaignTitle} - Interplanetary Fund`);
  paypalUrl.searchParams.set("currency_code", "USD");
  paypalUrl.searchParams.set("a3", amountUSD.toFixed(2));
  paypalUrl.searchParams.set("p3", String(recurringPlan.intervalCount));
  paypalUrl.searchParams.set("t3", recurringPlan.intervalUnit);
  paypalUrl.searchParams.set("src", "1");
  paypalUrl.searchParams.set("sra", "1");
  paypalUrl.searchParams.set("no_shipping", "1");
  paypalUrl.searchParams.set("custom", paymentReference);
  if (returnUrl) paypalUrl.searchParams.set("return", returnUrl);
  if (cancelUrl) paypalUrl.searchParams.set("cancel_return", cancelUrl);
  return paypalUrl.toString();
}

export function getNextChargeAt(fromDateOrIso, recurringPlan) {
  const next = new Date(fromDateOrIso);

  if (recurringPlan.intervalUnit === "D") {
    next.setUTCDate(next.getUTCDate() + recurringPlan.intervalCount);
  } else if (recurringPlan.intervalUnit === "W") {
    next.setUTCDate(next.getUTCDate() + recurringPlan.intervalCount * 7);
  } else if (recurringPlan.intervalUnit === "M") {
    next.setUTCMonth(next.getUTCMonth() + recurringPlan.intervalCount);
  } else if (recurringPlan.intervalUnit === "Y") {
    next.setUTCFullYear(next.getUTCFullYear() + recurringPlan.intervalCount);
  }

  return next.toISOString();
}

export function getRecurringChargeTransactionId(subscriptionId, billingCycleAt) {
  return `recurring_${subscriptionId}_${billingCycleAt}`;
}
