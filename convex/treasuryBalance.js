export function isEscrowedAllocation(allocation, nowIso) {
  return allocation.status === "allocated" && !!allocation.escrowReleaseAt && allocation.escrowReleaseAt > nowIso;
}

export function isReleasableAllocation(allocation, nowIso) {
  return allocation.status === "allocated" && (!allocation.escrowReleaseAt || allocation.escrowReleaseAt <= nowIso);
}

export function calculateAllocationBasedBalances({ totalBalance, pendingPayouts, allocations, nowIso }) {
  const pendingBalance = allocations
    .filter((allocation) => isEscrowedAllocation(allocation, nowIso))
    .reduce((sum, allocation) => sum + allocation.netAmount, 0);

  return {
    pendingBalance,
    availableBalance: Math.max(0, totalBalance - pendingPayouts - pendingBalance),
  };
}

export function resolveRequestedPayoutAmount({ requestedAmount, availableBalance }) {
  const payoutAmount = requestedAmount ?? availableBalance;
  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    throw new Error("Payout amount must be greater than zero");
  }
  if (payoutAmount > availableBalance) {
    throw new Error("Requested amount exceeds available balance");
  }
  return payoutAmount;
}
