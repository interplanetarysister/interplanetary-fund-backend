/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

type WithdrawStep = "idle" | "preview" | "submitted";

export default function Treasury() {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [payoutMethod, setPayoutMethod] = useState("cashapp");
  const [payoutDest, setPayoutDest] = useState("");
  const [step, setStep] = useState<WithdrawStep>("idle");
  const [result, setResult] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPlatform, setDepositPlatform] = useState("GoFundMe");
  const [depositUser, setDepositUser] = useState("user1");
  const [activeSection, setActiveSection] = useState<"overview" | "withdraw" | "deposit" | "history">("overview");

  const balances = useQuery(api.treasury.aggregateBalances, {});
  const campaignBalances = useQuery(api.treasury.getCampaignBalances, {});
  const payoutHistory = useQuery(api.treasury.getPayoutHistory, {});
  const withdraw = useMutation(api.simpleWithdraw.withdraw);
  const createDeposit = useMutation(api.treasury.createDeposit);

  if (!balances || !campaignBalances) {
    return <div className="text-center text-ifmuted py-20">Loading treasury...</div>;
  }

  const selectedCampaign = campaignBalances.campaigns.find(
    (c) => c.campaignId === selectedCampaignId
  );

  const handleWithdraw = async () => {
    if (!selectedCampaignId || !payoutDest) return;
    try {
      const res = await withdraw({
        campaignId: selectedCampaignId,
        payoutMethod,
        payoutDestination: payoutDest,
      });
      setResult(res);
      setStep("submitted");
    } catch (e: any) {
      setResult({ error: e.message });
      setStep("submitted");
    }
  };

  const handleDeposit = async () => {
    try {
      const res = await createDeposit({
        userId: depositUser,
        amount: parseFloat(depositAmount) || 0,
        sourcePlatform: depositPlatform,
      });
      setResult(res);
    } catch (e: any) {
      setResult({ error: e.message });
    }
  };

  const resetWithdraw = () => {
    setStep("idle");
    setResult(null);
    setSelectedCampaignId(null);
    setPayoutDest("");
    setPayoutMethod("cashapp");
  };

  const SECTIONS = [
    { id: "overview", label: "Overview" },
    { id: "withdraw", label: "Cash Out" },
    { id: "deposit", label: "Deposit" },
    { id: "history", label: "History" },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="page-title">Treasury</h2>
        <p className="page-subtitle">Holding accounts · Fee calculation · Payouts</p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeSection === s.id
                ? "bg-ifaccent text-white"
                : "bg-ifcard text-ifmuted border border-ifborder"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ===== OVERVIEW ===== */}
      {activeSection === "overview" && (
        <div className="space-y-3">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-ifcard rounded-xl p-3 border border-ifborder">
              <p className="text-xs text-ifmuted">Available Balance</p>
              <p className="text-2xl font-bold text-ifgreen mt-1">
                ${campaignBalances.totals.availableBalance.toFixed(2)}
              </p>
              <p className="text-[10px] text-ifmuted mt-0.5">Gross — before fees</p>
            </div>
            <div className="bg-ifcard rounded-xl p-3 border border-ifborder">
              <p className="text-xs text-ifmuted">You'd Receive</p>
              <p className="text-2xl font-bold text-ifaccent mt-1">
                ${campaignBalances.totals.netAmount.toFixed(2)}
              </p>
              <p className="text-[10px] text-ifmuted mt-0.5">Net — after fees</p>
            </div>
            <div className="bg-ifcard rounded-xl p-3 border border-ifborder">
              <p className="text-xs text-ifmuted">Total Fees</p>
              <p className="text-xl font-bold text-ifred mt-1">
                ${campaignBalances.totals.totalFees.toFixed(2)}
              </p>
              <p className="text-[10px] text-ifmuted mt-0.5">5% + 2.9% + $0.30</p>
            </div>
            <div className="bg-ifcard rounded-xl p-3 border border-ifborder">
              <p className="text-xs text-ifmuted">Paid Out</p>
              <p className="text-xl font-bold text-ifamber mt-1">
                ${balances.holdingAccounts.totalPaidOut.toFixed(2)}
              </p>
              <p className="text-[10px] text-ifmuted mt-0.5">Completed payouts</p>
            </div>
          </div>

          {/* Per-campaign breakdown */}
          <div className="card">
            <h3 className="text-sm font-semibold text-iftext mb-3">Per-Campaign Breakdown</h3>
            {campaignBalances.campaigns.length === 0 ? (
              <p className="text-xs text-ifmuted text-center py-4">No campaigns found</p>
            ) : (
              <div className="space-y-2">
                {campaignBalances.campaigns.map((c) => (
                  <div key={c.campaignId} className="bg-ifdark rounded-xl p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-iftext truncate">{c.title}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          c.status === "active" ? "bg-ifgreen/20 text-ifgreen" : "bg-ifmuted/20 text-ifmuted"
                        }`}>
                          {c.status}
                        </span>
                      </div>
                      <div className="text-right ml-2">
                        <p className="text-sm font-bold text-ifgreen">${c.availableBalance.toFixed(2)}</p>
                        <p className="text-[10px] text-ifmuted">gross</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <p className="text-ifmuted">Platform fee</p>
                        <p className="text-ifred">-${c.platformFee.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-ifmuted">Processing</p>
                        <p className="text-ifred">-${c.processingFee.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-ifmuted">Net</p>
                        <p className="text-ifaccent font-semibold">${c.netAmount.toFixed(2)}</p>
                      </div>
                    </div>
                    {c.pendingPayouts > 0 && (
                      <p className="text-[10px] text-ifamber mt-1">
                        ${c.pendingPayouts.toFixed(2)} pending payout
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== CASH OUT / WITHDRAW ===== */}
      {activeSection === "withdraw" && (
        <div className="space-y-3">
          {step === "submitted" ? (
            <div className="card">
              {result?.error ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ifred">Error</p>
                  <p className="text-xs text-ifmuted">{result.error}</p>
                  <button onClick={resetWithdraw} className="btn-secondary mt-2">Try Again</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ifgreen">Withdrawal Requested ✓</p>
                  <p className="text-xs text-ifmuted">Your request is pending admin review.</p>
                  <div className="flex justify-between text-xs mt-2">
                    <span className="text-ifmuted">You'll receive</span>
                    <span className="text-ifaccent font-bold">${result?.youReceive?.toFixed(2) ?? "—"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ifmuted">Method</span>
                    <span className="text-iftext">{result?.method} → {result?.destination}</span>
                  </div>
                  <button onClick={resetWithdraw} className="btn-secondary mt-2">New Withdrawal</button>
                </div>
              )}
            </div>
          ) : step === "preview" && selectedCampaign ? (
            <div className="space-y-3">
              <div className="card">
                <h3 className="text-sm font-semibold text-iftext mb-3">Review Withdrawal</h3>
                <p className="text-xs text-ifmuted mb-3 truncate">{selectedCampaign.title}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-ifmuted">Available Balance</span>
                    <span className="text-ifgreen font-semibold">${selectedCampaign.availableBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ifmuted">Platform Fee (5%)</span>
                    <span className="text-ifred">-${selectedCampaign.platformFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ifmuted">Processing (2.9% + $0.30)</span>
                    <span className="text-ifred">-${selectedCampaign.processingFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-ifborder">
                    <span className="text-iftext font-semibold">You Receive</span>
                    <span className="text-ifaccent font-bold text-lg">${selectedCampaign.netAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-ifmuted">Method</span>
                    <span className="text-iftext capitalize">{payoutMethod} → {payoutDest}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep("idle")} className="btn-secondary flex-1">Back</button>
                <button
                  onClick={handleWithdraw}
                  disabled={selectedCampaign.availableBalance <= 0}
                  className="btn-primary flex-1"
                >
                  Confirm Withdrawal
                </button>
              </div>
              <p className="text-[10px] text-ifmuted text-center">
                Withdrawal requires admin review before funds are sent.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Step 1: Select campaign */}
              <div className="card">
                <h3 className="text-sm font-semibold text-iftext mb-3">1. Select Campaign</h3>
                {campaignBalances.campaigns.filter((c) => c.availableBalance > 0).length === 0 ? (
                  <p className="text-xs text-ifmuted text-center py-4">No campaigns with available balance</p>
                ) : (
                  <div className="space-y-2">
                    {campaignBalances.campaigns
                      .filter((c) => c.availableBalance > 0)
                      .map((c) => (
                        <button
                          key={c.campaignId}
                          onClick={() => setSelectedCampaignId(c.campaignId)}
                          className={`w-full text-left p-3 rounded-xl border transition-colors ${
                            selectedCampaignId === c.campaignId
                              ? "border-ifaccent bg-ifaccent/10"
                              : "border-ifborder bg-ifdark"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <p className="text-xs font-medium text-iftext truncate flex-1">{c.title}</p>
                            <div className="text-right ml-2">
                              <p className="text-sm font-bold text-ifgreen">${c.availableBalance.toFixed(2)}</p>
                              <p className="text-[10px] text-ifaccent">→ ${c.netAmount.toFixed(2)} net</p>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Step 2: Payout method */}
              {selectedCampaignId && (
                <div className="card">
                  <h3 className="text-sm font-semibold text-iftext mb-3">2. Payout Method</h3>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {(["cashapp", "paypal", "bitcoin"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => { setPayoutMethod(m); setPayoutDest(""); }}
                        className={`py-2 rounded-xl text-xs font-medium transition-colors ${
                          payoutMethod === m
                            ? m === "cashapp" ? "bg-ifgreen text-white"
                              : m === "bitcoin" ? "bg-ifamber text-white"
                              : "bg-ifcyan text-white"
                            : "bg-ifdark text-ifmuted"
                        }`}
                      >
                        {m === "cashapp" ? "CashApp" : m === "bitcoin" ? "Bitcoin" : "PayPal"}
                      </button>
                    ))}
                  </div>
                  <input
                    type={payoutMethod === "paypal" ? "email" : "text"}
                    placeholder={
                      payoutMethod === "cashapp" ? "$Cashtag (e.g. $unrewound)"
                      : payoutMethod === "bitcoin" ? "BTC wallet address"
                      : "PayPal email address"
                    }
                    value={payoutDest}
                    onChange={(e) => setPayoutDest(e.target.value)}
                    className="input"
                  />
                  <button
                    onClick={() => setStep("preview")}
                    disabled={!payoutDest.trim()}
                    className="btn-primary mt-3"
                  >
                    Preview Withdrawal
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== DEPOSIT ===== */}
      {activeSection === "deposit" && (
        <div className="space-y-3">
          <div className="card">
            <h3 className="text-sm font-semibold text-iftext mb-3">Deposit / Migrate Funds</h3>
            <input
              type="text"
              placeholder="User ID"
              value={depositUser}
              onChange={(e) => setDepositUser(e.target.value)}
              className="input mb-2"
            />
            <input
              type="number"
              placeholder="Amount ($)"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="input mb-2"
            />
            <select
              value={depositPlatform}
              onChange={(e) => setDepositPlatform(e.target.value)}
              className="input mb-3"
            >
              <option value="GoFundMe">GoFundMe</option>
              <option value="Kickstarter">Kickstarter</option>
              <option value="Facebook">Facebook Fundraisers</option>
              <option value="Patreon">Patreon</option>
              <option value="Ko-fi">Ko-fi</option>
              <option value="Manual">Manual Entry</option>
            </select>
            <button
              onClick={handleDeposit}
              disabled={!depositAmount || !depositUser}
              className="btn-secondary"
            >
              Deposit to Holding Account
            </button>
          </div>
          {result && (
            <div className="card">
              {result.error ? (
                <p className="text-sm text-ifred">Error: {result.error}</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ifgreen">Deposited ✓</p>
                  <p className="text-xs text-ifmuted">
                    ${result.depositedAmount?.toLocaleString() ?? 0} added to holding account
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== HISTORY ===== */}
      {activeSection === "history" && (
        <div className="card">
          <h3 className="text-sm font-semibold text-iftext mb-3">Payout History</h3>
          {!payoutHistory || payoutHistory.length === 0 ? (
            <p className="text-xs text-ifmuted text-center py-4">No payout requests yet</p>
          ) : (
            <div className="space-y-2">
              {payoutHistory.map((p) => (
                <div key={p.payoutId} className="bg-ifdark rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-ifmuted">{new Date(p.requestedDate).toLocaleDateString()}</p>
                      <p className="text-xs text-iftext capitalize">{p.payoutMethod} → {p.payoutDestination}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-ifaccent">${p.netAmount.toFixed(2)}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        p.status === "completed" ? "bg-ifgreen/20 text-ifgreen"
                        : p.status === "pending" || p.status === "pending_payout" ? "bg-ifamber/20 text-ifamber"
                        : "bg-ifred/20 text-ifred"
                      }`}>
                        {p.adminReviewStatus ?? p.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-ifmuted">
                    <span>Gross: ${p.amountRequested.toFixed(2)}</span>
                    <span>Fees: ${p.feeAmount.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
