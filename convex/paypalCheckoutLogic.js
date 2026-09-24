export function getPayPalFeeConfig(feeConfig = {}) {
  return {
    platformFeePercent: feeConfig.platformFeePercent ?? 5,
    processingFeePercent: feeConfig.processingFeePercent ?? 2.9,
    processingFeeFlat: feeConfig.processingFeeFlat ?? 0.30,
  };
}

export function calculatePayPalFees(amount, feeConfig = {}) {
  const normalized = getPayPalFeeConfig(feeConfig);
  const platformFee = amount * (normalized.platformFeePercent / 100);
  const processingFee = amount * (normalized.processingFeePercent / 100) + normalized.processingFeeFlat;
  const netAmount = amount - platformFee - processingFee;

  return {
    ...normalized,
    platformFee,
    processingFee,
    netAmount,
  };
}

export function buildPayPalCheckoutUrl({
  business,
  campaignTitle,
  amount,
  currency = "USD",
  donationId,
}) {
  const paypalUrl = new URL("https://www.paypal.com/donate");
  paypalUrl.searchParams.set("cmd", "_donations");
  paypalUrl.searchParams.set("business", business);
  paypalUrl.searchParams.set("item_name", campaignTitle);
  paypalUrl.searchParams.set("amount", amount.toString());
  paypalUrl.searchParams.set("currency_code", currency);
  paypalUrl.searchParams.set("custom", donationId);
  return paypalUrl.toString();
}

export function createPayPalConfirmationPlan({
  donation,
  campaign,
  paypalTransactionId,
  now,
  feeConfig,
}) {
  if (!donation) {
    throw new Error("Donation not found");
  }

  const hasConfirmedStatus = donation.status === "confirmed" || donation.status === "completed";
  if (donation.confirmedAt && !hasConfirmedStatus) {
    throw new Error("Donation confirmation state is inconsistent. Please investigate before retrying.");
  }

  if (hasConfirmedStatus) {
    if (donation.providerTransactionId && donation.providerTransactionId !== paypalTransactionId) {
      throw new Error("Donation already confirmed with a different PayPal transaction ID.");
    }

    const donationPatch = {};
    if (!donation.providerTransactionId) {
      donationPatch.providerTransactionId = paypalTransactionId;
    }
    if (!donation.confirmedAt) {
      donationPatch.confirmedAt = now;
    }
    if (Object.keys(donationPatch).length > 0) {
      donationPatch.updatedAt = now;
    }

    return {
      alreadyConfirmed: true,
      donationPatch,
      summary: { donation: donation.amount },
    };
  }

  const fees = calculatePayPalFees(donation.amount, feeConfig);

  return {
    alreadyConfirmed: false,
    donationPatch: {
      status: "confirmed",
      providerTransactionId: paypalTransactionId,
      provider: "paypal",
      updatedAt: now,
      confirmedAt: now,
    },
    campaignPatch: campaign ? {
      raisedAmount: (campaign.raisedAmount || 0) + donation.amount,
      donorCount: (campaign.donorCount || 0) + 1,
      lastSynced: now,
    } : null,
    transactionRecord: {
      userId: donation.campaignId,
      type: "donation_received",
      amount: donation.amount,
      status: "confirmed",
      createdAt: now,
      paymentMethod: "paypal",
      paymentProvider: "paypal",
      currency: donation.currency || "USD",
      providerTransactionId: paypalTransactionId,
      donationId: donation._id,
      paymentReference: donation.paymentReference,
    },
    summary: {
      donation: donation.amount,
      platformFee: fees.platformFee.toFixed(2),
      processingFee: fees.processingFee.toFixed(2),
      netAmount: fees.netAmount.toFixed(2),
    },
  };
}
