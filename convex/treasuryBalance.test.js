import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAllocationBasedBalances,
  resolveRequestedPayoutAmount,
} from "./treasuryBalance.js";

const NOW = "2026-08-11T21:00:00.000Z";
const FUTURE = "2026-08-12T21:00:00.000Z";
const PAST = "2026-08-10T21:00:00.000Z";

test("fully available balance can be requested", () => {
  const { availableBalance, pendingBalance } = calculateAllocationBasedBalances({
    totalBalance: 100,
    pendingPayouts: 0,
    allocations: [{ status: "allocated", netAmount: 100, escrowReleaseAt: PAST }],
    nowIso: NOW,
  });

  assert.equal(pendingBalance, 0);
  assert.equal(availableBalance, 100);
  assert.equal(resolveRequestedPayoutAmount({ requestedAmount: 100, availableBalance }), 100);
});

test("escrowed balance cannot be requested", () => {
  const { availableBalance, pendingBalance } = calculateAllocationBasedBalances({
    totalBalance: 100,
    pendingPayouts: 0,
    allocations: [{ status: "allocated", netAmount: 100, escrowReleaseAt: FUTURE }],
    nowIso: NOW,
  });

  assert.equal(pendingBalance, 100);
  assert.equal(availableBalance, 0);
  assert.throws(
    () => resolveRequestedPayoutAmount({ requestedAmount: 1, availableBalance }),
    /Requested amount exceeds available balance/,
  );
});

test("amount exceeding available but below total balance is rejected", () => {
  const { availableBalance } = calculateAllocationBasedBalances({
    totalBalance: 200,
    pendingPayouts: 0,
    allocations: [
      { status: "allocated", netAmount: 150, escrowReleaseAt: FUTURE },
      { status: "allocated", netAmount: 50, escrowReleaseAt: PAST },
    ],
    nowIso: NOW,
  });

  assert.equal(availableBalance, 50);
  assert.throws(
    () => resolveRequestedPayoutAmount({ requestedAmount: 100, availableBalance }),
    /Requested amount exceeds available balance/,
  );
});

test("mixed available plus escrowed funds only allow available portion", () => {
  const { availableBalance, pendingBalance } = calculateAllocationBasedBalances({
    totalBalance: 250,
    pendingPayouts: 0,
    allocations: [
      { status: "allocated", netAmount: 100, escrowReleaseAt: FUTURE },
      { status: "allocated", netAmount: 150, escrowReleaseAt: PAST },
    ],
    nowIso: NOW,
  });

  assert.equal(pendingBalance, 100);
  assert.equal(availableBalance, 150);
  assert.equal(resolveRequestedPayoutAmount({ requestedAmount: 150, availableBalance }), 150);
});

test("funds become available after escrowReleaseAt passes", () => {
  const allocation = { status: "allocated", netAmount: 75, escrowReleaseAt: NOW };

  const beforeRelease = calculateAllocationBasedBalances({
    totalBalance: 75,
    pendingPayouts: 0,
    allocations: [allocation],
    nowIso: "2026-08-11T20:59:59.999Z",
  });
  const afterRelease = calculateAllocationBasedBalances({
    totalBalance: 75,
    pendingPayouts: 0,
    allocations: [allocation],
    nowIso: "2026-08-11T21:00:00.001Z",
  });

  assert.equal(beforeRelease.pendingBalance, 75);
  assert.equal(beforeRelease.availableBalance, 0);
  assert.equal(afterRelease.pendingBalance, 0);
  assert.equal(afterRelease.availableBalance, 75);
});

test("missing or null escrowReleaseAt is treated as releasable", () => {
  const { availableBalance, pendingBalance } = calculateAllocationBasedBalances({
    totalBalance: 100,
    pendingPayouts: 0,
    allocations: [
      { status: "allocated", netAmount: 40 },
      { status: "allocated", netAmount: 60, escrowReleaseAt: null },
    ],
    nowIso: NOW,
  });

  assert.equal(pendingBalance, 0);
  assert.equal(availableBalance, 100);
});

test("repeated payout requests remain safe via pending payout accounting", () => {
  const base = calculateAllocationBasedBalances({
    totalBalance: 100,
    pendingPayouts: 0,
    allocations: [{ status: "allocated", netAmount: 100, escrowReleaseAt: PAST }],
    nowIso: NOW,
  });
  const firstAuthorized = resolveRequestedPayoutAmount({
    requestedAmount: 100,
    availableBalance: base.availableBalance,
  });
  assert.equal(firstAuthorized, 100);

  const secondAttempt = calculateAllocationBasedBalances({
    totalBalance: 100,
    pendingPayouts: 100,
    allocations: [{ status: "allocated", netAmount: 100, escrowReleaseAt: PAST }],
    nowIso: NOW,
  });
  assert.equal(secondAttempt.availableBalance, 0);
  assert.throws(
    () => resolveRequestedPayoutAmount({ requestedAmount: 1, availableBalance: secondAttempt.availableBalance }),
    /Requested amount exceeds available balance/,
  );
});
