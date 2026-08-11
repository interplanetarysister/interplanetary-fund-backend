# Banking Infrastructure — Audit & Action Plan

**Document Version:** 1.0  
**Date:** 2026-08-11  
**Author:** Lyra (Copilot Chief of Staff)  
**Issue Ref:** #28 — Banking Infrastructure  
**Status:** Submitted for approval

---

## Executive Summary

This document provides a complete audit of the Interplanetary Fund banking infrastructure: what is fully implemented, what has been designed but not yet built, what requires net-new work, and a sequenced action plan that can be executed safely without introducing bugs or security regressions.

The platform already has a substantial foundation. The ledger schema, fee-calculation engine, payout request pipeline, fund-migration cron, and multi-method checkout (PayPal, CashApp, Bitcoin) are all live in Convex. The primary gaps are in the **inbound data layer** (real-time webhook receivers for external platforms) and several **ledger completeness items** (chargeback/refund entries, FX currency tracking, and a formal allocations table).

---

## Section 1 — Audit: What Exists Today

### 1.1 Schema (`convex/schema.ts`)

| Table | Purpose | Status |
|-------|---------|--------|
| `transactions` | Per-event ledger rows — deposit, payout, fund_migration_detected | ✅ Implemented |
| `donations` | Donor-facing records; stores gross amount, method, provider, idempotency key | ✅ Implemented |
| `feeConfig` | Active/inactive fee configs; platform % + processing % + flat | ✅ Implemented |
| `holdingAccounts` | Per-user balance cache (totalBalance, totalFeesDeducted, totalPaidOut, pendingPayouts) | ✅ Implemented |
| `payoutRequests` | Tracks payout lifecycle from pending → admin_approved → completed | ✅ Implemented |
| `externalPlatforms` | Stores per-platform externalTotal and donor counts for 11 platforms | ✅ Implemented |
| `exchangeRateCache` | BTC/USD rate cache with TTL and source field | ✅ Implemented |
| `monitoredCampaigns` | Campaign-level raisedAmount, donorCount, frozen flag | ✅ Implemented |
| `protocolReports` | Audit log for every scheduled cron run | ✅ Implemented |
| **`fees` (line-item)** | Per-transaction fee line items (processor_fee vs platform_fee breakdown) | ❌ Not implemented — fees embedded in payoutRequests only |
| **`allocations`** | Maps funds to campaign_id; double-entry destination ledger | ❌ Not implemented |

**Gap summary:** The schema is 80% complete. The missing `fees` and `allocations` tables are described in the issue as core to a true double-entry ledger. They can be added to `convex/schema.ts` without breaking any existing queries.

---

### 1.2 Fee Calculation Engine (`convex/treasury.ts`)

| Feature | Status |
|---------|--------|
| `calculatePayout` — gross-to-net with live feeConfig | ✅ Implemented |
| `calculateBatchPayout` — multi-campaign batch | ✅ Implemented |
| `aggregateBalances` — real-time total across all accounts | ✅ Implemented |
| `createDeposit` — records deposit, updates holdingAccount | ✅ Implemented |
| `requestPayout` — creates payoutRequest + transaction | ✅ Implemented |
| `completePayout` — admin-gated; requires super admin approval | ✅ Implemented |
| `updateFeeConfig` — admin PIN-gated | ✅ Implemented |
| **Gross-to-net formula (P-7)** | ✅ Implemented |
| **Payout delay / pending vs available split** | ⚠️ Partial — `pendingPayouts` field exists; UI needs to surface it separately |
| **Chargeback / refund negative entry** | ❌ Not implemented |
| **FX base-currency ledger** | ❌ Not implemented (BTC handled; multi-fiat not tracked) |

---

### 1.3 Fund Migration (`convex/fundMigration.ts`)

| Feature | Status |
|---------|--------|
| `recordMigration` — single platform withdrawal → ledger | ✅ Implemented |
| `batchMigrate` — multi-platform batch | ✅ Implemented |
| `selectPayoutMethod` — user picks payout destination | ✅ Implemented |
| `getMigrationHistory` — per-campaign audit | ✅ Implemented |
| `checkBalancesAndQueueMigrations` (internal cron) | ✅ Implemented |
| Idempotency guard (prevents duplicate migrations) | ✅ Implemented |
| Failure isolation per platform | ✅ Implemented |
| Audit log persisted as protocolReport | ✅ Implemented |

---

### 1.4 Cron Jobs (`convex/crons.ts`)

| Job | Schedule | Purpose | Status |
|-----|----------|---------|--------|
| `daily-raised-amount-sync` | 5am Pacific / 12:00 UTC | Aggregates externalPlatforms → monitoredCampaigns | ✅ Active |
| `weekly-balance-check` | Sunday 6am Pacific | Flags non-zero platform balances | ✅ Active |
| `daily-platform-balance-check` | 9am Pacific / 16:00 UTC | Queues fund migrations | ✅ Active |
| `daily-protocol-enforcement` | 6am Pacific | P-1 through P-8 compliance | ✅ Active |
| **Hourly external API polling** | Every hour | Query external REST APIs for platforms without webhooks | ❌ Not implemented |
| **Webhook ingest cron / handler** | Real-time HTTP | Receive push events from Stripe, PayPal, GoFundMe | ❌ Not implemented |
| **Chargeback processing** | On-event | Write negative ledger entry when chargeback received | ❌ Not implemented |

---

### 1.5 Payment Checkout (`convex/paymentRouter.ts`, `convex/paypalCheckout.ts`)

| Feature | Status |
|---------|--------|
| PayPal donate button (external_link mode) | ✅ Implemented |
| CashApp direct link | ✅ Implemented |
| Bitcoin on-chain (address + amount + confirmations) | ✅ Implemented |
| BTC/USD exchange rate cache | ✅ Implemented |
| Idempotency key enforcement | ✅ Implemented |
| Donation validation (min $0.01 / max $100,000) | ✅ Implemented |
| **Stripe** | 🚫 Excluded by design (no Stripe anywhere) |
| **Plaid / open-banking aggregation** | ❌ Not implemented |
| **Platform webhook receivers** | ❌ Not implemented |

---

### 1.6 Withdrawal Methods (`convex/withdrawalMethods.ts`)

| Feature | Status |
|---------|--------|
| Confirmed payout destinations (CashApp, PayPal, Bitcoin) | ✅ Documented as constants |
| Per-platform non-Stripe withdrawal method map | ✅ Implemented |
| **Automated payout dispatch** (actually send money) | ❌ Not implemented — payout requests are queued and admin-completed manually |

---

## Section 2 — Gap Analysis

### 2.1 What Is Designed but Not Yet Built

These items have supporting schema fields or data structures already in place but lack the implementation logic:

| Item | Where Designed | What Needs to Be Built |
|------|---------------|----------------------|
| Line-item fee table | Referenced in issue schema; `feeAmount` exists in payoutRequests | Add `fees` table to schema; write fee rows on every deposit/payout |
| Allocations table | Referenced in issue schema | Add `allocations` table; write allocation on every donation record |
| Pending vs Available split in UI | `pendingPayouts` field in holdingAccounts | Treasury query to return `availableBalance = totalBalance - pendingPayouts` |
| FX currency ledger | `currency` field on `transactions` and `donations` | Capture native currency + conversion rate on every non-USD transaction |

### 2.2 What Still Needs to Be Made

These features have no implementation at all:

1. **Webhook ingest handler** — HTTP endpoint that receives real-time events from external platforms (PayPal IPN, GoFundMe webhook, Ko-fi webhook, etc.) and writes a transaction + donation record.
2. **Hourly external API polling cron** — for platforms that do not offer webhooks (e.g., Indiegogo, Kickstarter public API), a cron polls their REST APIs to detect new donations.
3. **Chargeback / refund negative ledger entry** — when a chargeback is received, write a `type: "chargeback"` transaction with a negative amount to debit the holding account.
4. **FX conversion pipeline** — for donations in EUR, GBP, or CAD, fetch the exchange rate, store it on the transaction, and calculate net in both native and USD.
5. **Plaid / open-banking aggregation** — optional: for platforms without any API (e.g., Spotfund, FundRazr), a Plaid connection can monitor the linked bank account for ACH deposits.
6. **Automated payout dispatch** — actually sending money (PayPal Payouts API, CashApp API) rather than just marking payout as "completed" after admin confirmation.
7. **Escrow lock / payout delay flag** — track `availableAt` timestamp on each transaction to enforce 2–7 day hold periods imposed by external platforms before funds are released.

---

## Section 3 — Double-Entry Ledger Architecture

The current schema is **single-entry** (each donation writes one row). The issue requires a **double-entry** approach so funds cannot disappear or be double-counted. Here is the target state:

```
[Gross External Donation]
       │
       ├──► transactions row  { type:"deposit", amount: gross, currency, sourcePlatform, campaignId }
       │
       ├──► fees rows (2)
       │      { transactionId, fee_type:"processor_fee", amount: processingFee }
       │      { transactionId, fee_type:"platform_fee",  amount: platformFee  }
       │
       ├──► allocations row
       │      { transactionId, campaignId, userId, netAmount }
       │
       └──► holdingAccounts.totalBalance += netAmount
            holdingAccounts.totalFeesDeducted += totalFees
```

### 3.1 Schema Additions Required (safe — additive only)

**File:** `convex/schema.ts`

```typescript
// FEES — per-transaction fee line items
fees: defineTable({
  transactionId: v.id("transactions"),
  feeType: v.string(),       // "processor_fee" | "platform_fee" | "chargeback" | "fx_conversion"
  amount: v.number(),         // positive = deduction, negative = refund/reversal
  currency: v.string(),       // "USD" by default
  rateUsed: v.optional(v.number()), // e.g. 0.029 for 2.9%
  flatAmount: v.optional(v.number()),
  createdAt: v.string(),
}).index("byTransactionId", ["transactionId"]),

// ALLOCATIONS — maps net funds to destination
allocations: defineTable({
  transactionId: v.id("transactions"),
  campaignId: v.optional(v.string()),
  userId: v.string(),
  grossAmount: v.number(),
  totalFees: v.number(),
  netAmount: v.number(),
  currency: v.string(),
  nativeCurrency: v.optional(v.string()),    // original currency if non-USD
  nativeAmount: v.optional(v.number()),       // original amount
  fxRate: v.optional(v.number()),             // exchange rate used
  escrowReleaseAt: v.optional(v.string()),    // ISO timestamp when funds are available
  status: v.string(),   // "allocated" | "payout_pending" | "paid_out" | "reversed"
  createdAt: v.string(),
}).index("byUserId", ["userId"])
  .index("byCampaignId", ["campaignId"])
  .index("byStatus", ["status"]),
```

**Risk:** Zero — these are new tables. No existing query is modified.

---

## Section 4 — Implementation Action Plan

All items below are ordered by dependency. Items with no dependencies can run in parallel.

---

### Phase 1 — Schema Completeness (1–2 days, no risk)

**Goal:** Add `fees` and `allocations` tables to the Convex schema.

| Step | File | Action |
|------|------|--------|
| 1.1 | `convex/schema.ts` | Add `fees` table definition (see Section 3.1) |
| 1.2 | `convex/schema.ts` | Add `allocations` table definition (see Section 3.1) |
| 1.3 | `convex/_generated/api.ts` | Re-run `npx convex dev` to regenerate type bindings |

**Data population:** No seed data needed. Tables populate automatically when Step 2 writes to them.

---

### Phase 2 — Treasury: Double-Entry Writes (2–3 days, low risk)

**Goal:** Update `createDeposit` and `requestPayout` in `convex/treasury.ts` to write `fees` rows and `allocations` rows atomically alongside the existing transaction record.

| Step | File | Action |
|------|------|--------|
| 2.1 | `convex/treasury.ts` — `createDeposit` | After inserting the `transactions` row, insert two `fees` rows (processor_fee, platform_fee) and one `allocations` row |
| 2.2 | `convex/treasury.ts` — `requestPayout` | Insert a `fees` row for the payout fee; update the `allocations` row status to `payout_pending` |
| 2.3 | `convex/treasury.ts` — `completePayout` | Update `allocations` row status to `paid_out` |
| 2.4 | `convex/treasury.ts` — new query `getNetAvailableBalance` | Returns `totalBalance - pendingPayouts` per user; exposes pending vs available separately |

**Example logic for `createDeposit` addition (after existing transaction insert):**
```typescript
// After: const transactionId = await ctx.db.insert("transactions", { ... });

const feeConfig = await ctx.db.query("feeConfig").filter(q => q.eq("active", true)).first();
const platformFeePercent = feeConfig?.platformFeePercent ?? 5;
const processingFeePercent = feeConfig?.processingFeePercent ?? 2.9;
const processingFeeFlat = feeConfig?.processingFeeFlat ?? 0.30;

const platformFeeAmt = args.amount * (platformFeePercent / 100);
const processingFeeAmt = args.amount * (processingFeePercent / 100) + processingFeeFlat;
const totalFees = platformFeeAmt + processingFeeAmt;
const netAmount = args.amount - totalFees;
const now = new Date().toISOString();

await ctx.db.insert("fees", {
  transactionId,
  feeType: "platform_fee",
  amount: platformFeeAmt,
  currency: "USD",
  rateUsed: platformFeePercent / 100,
  createdAt: now,
});
await ctx.db.insert("fees", {
  transactionId,
  feeType: "processor_fee",
  amount: processingFeeAmt,
  currency: "USD",
  rateUsed: processingFeePercent / 100,
  flatAmount: processingFeeFlat,
  createdAt: now,
});
await ctx.db.insert("allocations", {
  transactionId,
  campaignId: args.campaignId,
  userId: args.userId,
  grossAmount: args.amount,
  totalFees,
  netAmount,
  currency: "USD",
  status: "allocated",
  createdAt: now,
});
```

---

### Phase 3 — Chargeback / Refund Negative Entry (1 day, low risk)

**Goal:** Provide a mutation that writes a negative-amount transaction when a chargeback or refund is received.

| Step | File | Action |
|------|------|--------|
| 3.1 | `convex/treasury.ts` | Add `recordChargeback` mutation |
| 3.2 | `convex/treasury.ts` | Inside `recordChargeback`, insert a `transactions` row with `type: "chargeback"` and negative `amount`; insert a `fees` row with `feeType: "chargeback"` and negative amount; update `allocations` status to `reversed`; debit `holdingAccounts.totalBalance` |

**Security:** This mutation must require `adminPin` (same pattern as `completePayout`) to prevent fraudulent reversals.

**Data to populate:** Chargebacks are inserted on receipt of an external platform notification. No seed data needed. When webhook integration (Phase 5) is live, chargebacks are written automatically.

---

### Phase 4 — FX Currency Ledger (1–2 days, low risk)

**Goal:** For every non-USD donation, store the native currency and conversion rate.

| Step | File | Action |
|------|------|--------|
| 4.1 | `convex/schema.ts` — `transactions` | Verify `currency` and `providerTransactionId` fields exist (they do) |
| 4.2 | `convex/schema.ts` — `allocations` | Use `nativeCurrency`, `nativeAmount`, `fxRate` fields (added in Phase 1) |
| 4.3 | `convex/treasury.ts` — `createDeposit` | Accept optional `currency`, `nativeAmount`, `fxRate` args; populate `allocations` fields when present |
| 4.4 | `convex/paymentRouter.ts` | BTC conversion already uses `exchangeRateCache`; extend the same pattern to EUR/GBP/CAD using a `getExchangeRate` helper that calls a free FX API (e.g. `open.er-api.com`) and caches in `exchangeRateCache` |

**Environment variable to add to `.env.example`:**
```
VITE_FX_API_KEY=          # Optional — open.er-api.com free tier requires no key
```

---

### Phase 5 — Webhook Ingest (3–5 days, moderate complexity)

**Goal:** Receive real-time donation events from external platforms via HTTP POST.

#### Architecture

Convex does not serve raw HTTP on a custom path natively. The recommended approach is an **HTTP Action** (`convex/http.ts`) which Convex exposes at `https://<deployment>.convex.site/webhooks/<platform>`.

| Step | File | Action |
|------|------|--------|
| 5.1 | `convex/webhooks.ts` (new) | Create a new file with `httpAction` handlers for each platform |
| 5.2 | `convex/http.ts` (new) | Wire routes: `POST /webhooks/paypal`, `POST /webhooks/kofi`, `POST /webhooks/gofundme`, etc. |
| 5.3 | Per platform | Register the webhook URL in each platform's dashboard settings |
| 5.4 | `convex/webhooks.ts` | Validate webhook signature/secret before writing any data (HMAC or token match) |
| 5.5 | `convex/webhooks.ts` | On valid event: call `treasury.createDeposit` (or direct insert) to record the donation |

**Webhook URL pattern (Convex HTTP Actions):**
```
https://rosy-butterfly-2.convex.site/webhooks/paypal
https://rosy-butterfly-2.convex.site/webhooks/kofi
https://rosy-butterfly-2.convex.site/webhooks/gofundme
```

**Platforms and their webhook mechanisms:**

| Platform | Webhook Type | Verification Method | Notes |
|----------|-------------|--------------------|----|
| PayPal | IPN (Instant Payment Notification) | Token match via PAYPAL_WEBHOOK_SECRET | Must verify with PayPal IPN Listener protocol |
| Ko-fi | POST webhook | Token match (Ko-fi sends a `verification_token`) | Simple header check |
| Buy Me a Coffee | POST webhook | `data.verification_token` | Match against BMAC_WEBHOOK_SECRET |
| GoFundMe | No public API | — | Manual export only; use polling cron |
| Patreon | Webhook + HMAC-MD5 | `X-Patreon-Signature` header | HMAC-MD5 of raw body |
| Kickstarter | No webhook | — | Use polling or manual export |
| Indiegogo | No webhook | — | Use polling |
| Spotfund | No documented API | — | Manual only; flag balance in UI |
| FundRazr | No webhook | — | Manual only |
| GiveSendGo | No webhook | — | Manual only |
| Bluesky | Not a payment platform | — | Outreach only |
| CashApp | No inbound webhook API | — | Manual bank sync |

**New environment variables to add to `.env.example`:**
```
PAYPAL_WEBHOOK_SECRET=        # From PayPal developer dashboard
KOFI_WEBHOOK_TOKEN=           # From Ko-fi Settings → Webhooks
BMAC_WEBHOOK_SECRET=          # From Buy Me a Coffee dashboard
PATREON_WEBHOOK_SECRET=       # From Patreon developer portal
```

**Security requirements for webhook handlers:**
1. Always verify the signature/token before inserting any data.
2. Respond `200 OK` immediately even if processing fails (queue the event for retry instead of returning 5xx, which causes external platforms to retry indefinitely).
3. Use idempotency keys (`providerTransactionId`) to prevent duplicate ledger entries.
4. Log all raw payloads to `protocolReports` for 30 days for dispute resolution.

---

### Phase 6 — Hourly Polling Cron (1–2 days)

**Goal:** For platforms without webhooks (GoFundMe, Kickstarter, Indiegogo), add an hourly cron that fetches donation totals and compares to the last-synced value.

| Step | File | Action |
|------|------|--------|
| 6.1 | `convex/crons.ts` | Add `crons.hourly("hourly-platform-poll", { minuteUTC: 30 }, internal.platformPoller.pollAllPlatforms, {})` |
| 6.2 | `convex/platformPoller.ts` (new) | `internalMutation` that iterates `externalPlatforms` where `automationMode === "polling"`, calls each platform's read-only API endpoint, writes new delta donations as transactions, updates `externalTotal` |

**Polling safety:** Use `providerTransactionId` deduplication in `transactions` (index `byProviderTransactionId` already exists in schema) so re-polling never creates duplicate ledger entries.

---

### Phase 7 — Escrow Lock / Payout Delay (1 day)

**Goal:** Track 2–7 day platform holding periods so the UI shows two distinct balances: **Pending Balance** and **Available for Payout**.

| Step | File | Action |
|------|------|--------|
| 7.1 | `convex/schema.ts` — `allocations` | Use `escrowReleaseAt` field (already added in Phase 1) |
| 7.2 | `convex/treasury.ts` — `createDeposit` | Accept optional `escrowDays` arg (default 0); set `escrowReleaseAt = now + escrowDays * 86400000` |
| 7.3 | `convex/treasury.ts` — new query `getBalanceSummary` | Returns `{ pendingBalance, availableForPayout }` by filtering allocations where `escrowReleaseAt > now` vs. not |
| 7.4 | Per platform | Document the escrow days per platform: GoFundMe 2–5 days, Kickstarter 14 days, Ko-fi 3 days, etc. |

---

### Phase 8 — Automated Payout Dispatch (Future — requires PayPal Payouts API approval)

**Goal:** Send money automatically rather than relying on admin manually marking payouts complete.

> ⚠️ **Prerequisite:** PayPal Payouts API requires a separate application approval. CashApp has no public payout API. Bitcoin withdrawals can be automated via the Bitcoin node or a third-party signing service.

| Step | File | Action |
|------|------|--------|
| 8.1 | `convex/paypalPayouts.ts` (new) | Use PayPal Payouts API to dispatch funds to `interplanetarysister@gmail.com` |
| 8.2 | `convex/treasury.ts` — `completePayout` | Call `paypalPayouts.dispatch` when `payoutMethod === "paypal"` |
| 8.3 | `convex/treasury.ts` — `completePayout` | Write Bitcoin transaction via PSBT signing for `payoutMethod === "bitcoin"` |

**New environment variables:**
```
PAYPAL_CLIENT_ID=             # PayPal REST API credentials
PAYPAL_CLIENT_SECRET=         # PayPal REST API credentials
PAYPAL_PAYOUTS_ENABLED=false  # Feature flag — set true only after API approval
```

---

## Section 5 — Security Checklist

Every phase must pass the following checks before merging:

| Check | Requirement |
|-------|------------|
| Webhook signature verification | All webhook handlers must validate HMAC or token before writing data |
| Admin PIN gating | Chargebacks, fee config changes, and payout completion require admin PIN |
| Rate limiting | All write mutations already use `checkRateLimit`; new mutations must also |
| Idempotency | All deposit/donation writes must check `providerTransactionId` or `idempotencyKey` for duplicates |
| Secret scanning | No API keys or webhook secrets committed to source — all via environment variables |
| Frozen account guard | All payout paths already check `account.frozen`; chargeback handler must also freeze account if fraud threshold exceeded |
| Negative-amount validation | Chargeback writes must enforce that only admin can create negative transactions |
| Input validation | All `amount` args must pass `validateDonation(amount)` |

---

## Section 6 — Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Duplicate ledger entries from webhooks | Medium | Idempotency key / `providerTransactionId` index dedup |
| Chargeback triggers double debit | Low | Admin-gated; allocations status check before applying reversal |
| FX rate stale on large donation | Low | `exchangeRateCache` TTL already 5 min for BTC; same approach for fiat |
| Webhook secret exposed in logs | Medium | Never log raw webhook payloads; sanitize before writing to protocolReports |
| Admin PIN brute force | Low | `checkRateLimit("payout_complete", 5, 300000)` already in place |
| Platform API key revoked mid-cron | Low | Cron failure isolation already wraps each platform in try/catch |

---

## Section 7 — File Location Reference

| File | Current State | Role |
|------|-------------|------|
| `convex/schema.ts` | Implemented | Add `fees` + `allocations` tables (Phase 1) |
| `convex/treasury.ts` | Implemented | Add double-entry writes, `getNetAvailableBalance`, `recordChargeback` (Phase 2, 3) |
| `convex/fundMigration.ts` | Implemented | Extend with `escrowReleaseAt` when migration detected (Phase 7) |
| `convex/crons.ts` | Implemented | Add hourly polling cron entry (Phase 6) |
| `convex/webhooks.ts` | ❌ To be created | HTTP Action webhook ingest handlers (Phase 5) |
| `convex/http.ts` | ❌ To be created | Route wiring for `/webhooks/*` paths (Phase 5) |
| `convex/platformPoller.ts` | ❌ To be created | Hourly polling internalMutation (Phase 6) |
| `convex/paypalPayouts.ts` | ❌ To be created | Automated payout dispatch via PayPal Payouts API (Phase 8, future) |
| `.env.example` | Implemented | Add `PAYPAL_WEBHOOK_SECRET`, `KOFI_WEBHOOK_TOKEN`, `BMAC_WEBHOOK_SECRET`, `PATREON_WEBHOOK_SECRET` |

---

## Section 8 — Recommended Implementation Sequence

```
Phase 1 (Schema)  ──►  Phase 2 (Double-Entry Treasury)  ──►  Phase 3 (Chargeback)
                                        │
                                        ├──►  Phase 4 (FX)  ──►  Phase 6 (Polling)
                                        │
                                        └──►  Phase 5 (Webhooks)  ──►  Phase 7 (Escrow)
                                                                              │
                                                                              └──►  Phase 8 (Auto-Payout, future)
```

**Phases 1–3** are safe, self-contained, and do not depend on any external API. They can be implemented and deployed immediately.

**Phases 4–7** require external API credentials and platform dashboard access but do not risk existing balances.

**Phase 8** is a future item gated on PayPal Payouts API approval and should not be started until Phases 1–7 are live and audited.

---

## Section 9 — Data Population Guide

| Table | How Data Gets In |
|-------|----------------|
| `fees` | Written automatically by `createDeposit` and `requestPayout` (Phase 2) |
| `allocations` | Written automatically by `createDeposit` (Phase 2) |
| `exchangeRateCache` | Already populated by BTC checkout; extend with fiat rates (Phase 4) |
| `transactions` | Already populated; add `currency` + `fxRate` fields (Phase 4) |
| `feeConfig` | Already seeded; admin can update via `updateFeeConfig` mutation |
| `holdingAccounts` | Already populated via `createDeposit` |
| Webhook-sourced donations | Populated by `convex/webhooks.ts` httpAction handlers (Phase 5) |

No manual seed data is required for the banking tables. All data flows through the event pipeline.

---

*Plan prepared by Lyra — ready for Michelle's review and approval.*
