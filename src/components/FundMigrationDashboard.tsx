/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface Migration {
  campaignId: string;
  campaignTitle: string;
  sourcePlatform: string;
  grossAmount: number;
}

type Step = "entries" | "payout" | "confirm" | "result";

const PAYOUT_OPTIONS = [
  { method: "cashapp",  destination: "$unrewound",                                      label: "CashApp",  hint: "$unrewound" },
  { method: "paypal",   destination: "interplanetarysister@gmail.com",                  label: "PayPal",   hint: "interplanetarysister@gmail.com" },
];

export function FundMigrationDashboard({ initialCampaignId }: { initialCampaignId?: string }) {
  const [step, setStep] = useState<Step>("entries");
  const [migrations, setMigrations] = useState<Migration[]>([
    { campaignId: "", campaignTitle: "", sourcePlatform: "", grossAmount: 0 },
  ]);
  const [payoutMethod, setPayoutMethod] = useState("cashapp");
  const [payoutDest, setPayoutDest] = useState(PAYOUT_OPTIONS[0].destination);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const batchMigrate = useMutation(api.fundMigration.batchMigrate);
  const selectPayoutMethod = useMutation(api.fundMigration.selectPayoutMethod);
  const campaigns = useQuery(api.campaigns.getCampaigns, {});
  const pendingPayouts = useQuery(api.fundMigration.getPendingPayouts, {});

  useEffect(() => {
    if (!initialCampaignId || !campaigns || campaigns.length === 0) return;
    const selected = (campaigns as any[]).find((c: any) => c.ifCampaignId === initialCampaignId);
    if (!selected) return;
    setMigrations((prev) => {
      if (!prev[0] || prev[0].campaignId) return prev;
      const next = [...prev];
      next[0] = {
        ...next[0],
        campaignId: selected.ifCampaignId,
        campaignTitle: selected.title,
      };
      return next;
    });
  }, [initialCampaignId, campaigns]);

  const addMigration = () => {
    setMigrations([...migrations, { campaignId: "", campaignTitle: "", sourcePlatform: "", grossAmount: 0 }]);
  };

  const updateMigration = (index: number, field: keyof Migration, value: string | number) => {
    const updated = [...migrations];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-fill title when campaign is selected
    if (field === "campaignId" && campaigns) {
      const camp = (campaigns as any).find?.((c: any) => c.ifCampaignId === value);
      if (camp) updated[index].campaignTitle = camp.title;
    }
    setMigrations(updated);
  };

  const removeMigration = (index: number) => {
    setMigrations(migrations.filter((_, i) => i !== index));
  };

  const totalGross = migrations.reduce((sum, m) => sum + (m.grossAmount || 0), 0);
  const totalPlatformFee = totalGross * 0.05;
  const totalProcessingFee = totalGross * 0.029 + (migrations.length * 0.30);
  const totalNet = totalGross - totalPlatformFee - totalProcessingFee;

  const handlePayoutSelect = (option: typeof PAYOUT_OPTIONS[0]) => {
    setPayoutMethod(option.method);
    setPayoutDest(option.destination);
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      const validMigrations = migrations.filter(
        m => m.campaignId && m.campaignTitle && m.sourcePlatform && m.grossAmount > 0
      );
      if (validMigrations.length === 0) {
        setError("Please fill in at least one valid migration entry.");
        return;
      }
      const res = await batchMigrate({
        migrations: validMigrations,
        withdrawnBy: "admin",
      });
      if (res?.details?.length) {
        await Promise.all(
          res.details.map((item: any) =>
            selectPayoutMethod({
              payoutId: item.payoutId,
              payoutMethod: payoutMethod as "cashapp" | "paypal",
              payoutDestination: payoutDest,
            })
          )
        );
      }
      setResult(res);
      setStep("result");
    } catch (e: any) {
      setError(e.message || "Migration failed. Please try again.");
    }
  };

  // Step: Entries
  if (step === "entries") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-iftext">Fund Migration</h3>
          <p className="text-[10px] text-ifmuted mt-0.5">
            Withdraw from external platforms → IF processes fees → net to campaign owner
          </p>
        </div>

        {/* Pending payouts alert */}
        {pendingPayouts && pendingPayouts.length > 0 && (
          <div className="bg-ifamber/10 border border-ifamber rounded-xl p-3">
            <p className="text-xs font-semibold text-ifamber">
              {pendingPayouts.length} pending payout{pendingPayouts.length > 1 ? "s" : ""} awaiting selection
            </p>
          </div>
        )}

        {migrations.map((m, i) => (
          <div key={i} className="card space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-iftext">Withdrawal #{i + 1}</span>
              {migrations.length > 1 && (
                <button onClick={() => removeMigration(i)} className="text-ifred text-xs">Remove</button>
              )}
            </div>

            <select
              value={m.campaignId}
              onChange={(e) => updateMigration(i, "campaignId", e.target.value)}
              className="input"
            >
              <option value="">Select campaign...</option>
              {((campaigns as any) || []).map?.((c: any) => (
                <option key={c.ifCampaignId} value={c.ifCampaignId}>{c.title}</option>
              ))}
            </select>

            <select
              value={m.sourcePlatform}
              onChange={(e) => updateMigration(i, "sourcePlatform", e.target.value)}
              className="input"
            >
              <option value="">Select source platform...</option>
              {["Buy Me a Coffee", "Patreon", "Ko-fi", "GoFundMe", "Spotfund",
                "Kickstarter", "Indiegogo", "GiveSendGo", "FundRazr", "Facebook"].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ifmuted">$</span>
              <input
                type="number"
                placeholder="Amount withdrawn"
                value={m.grossAmount || ""}
                onChange={(e) => updateMigration(i, "grossAmount", parseFloat(e.target.value) || 0)}
                className="flex-1 input"
              />
            </div>
          </div>
        ))}

        <button
          onClick={addMigration}
          className="w-full py-2 border-2 border-dashed border-ifborder rounded-xl text-ifmuted text-sm"
        >
          + Add another withdrawal
        </button>

        {/* Summary */}
        <div className="card space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-ifmuted">Total withdrawn</span>
            <span className="font-semibold text-iftext">${totalGross.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ifmuted">Platform fee (5%)</span>
            <span className="text-ifred">-${totalPlatformFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ifmuted">Processing (2.9% + $0.30)</span>
            <span className="text-ifred">-${totalProcessingFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-ifborder">
            <span className="font-bold text-iftext">Net to campaign owners</span>
            <span className="font-bold text-ifgreen">${totalNet.toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={() => setStep("payout")}
          disabled={totalGross <= 0}
          className="btn-primary disabled:opacity-50"
        >
          Continue → Select Payout Method
        </button>
      </div>
    );
  }

  // Step: Payout selection
  if (step === "payout") {
    const selected = PAYOUT_OPTIONS.find(o => o.method === payoutMethod);
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-iftext">Select Payout Method</h3>
          <p className="text-[10px] text-ifmuted mt-0.5">
            Net amount: <span className="text-ifgreen font-semibold">${totalNet.toFixed(2)}</span>
          </p>
        </div>

        <div className="space-y-2">
          {PAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.method}
              onClick={() => handlePayoutSelect(opt)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                payoutMethod === opt.method
                  ? "border-ifaccent bg-ifaccent/10"
                  : "border-ifborder bg-ifdark"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-iftext">{opt.label}</span>
                {payoutMethod === opt.method && (
                  <span className="text-ifaccent text-xs font-bold">Selected ✓</span>
                )}
              </div>
              <p className="text-[10px] text-ifmuted mt-1 break-all">{opt.hint}</p>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={() => setStep("entries")} className="btn-secondary flex-1">Back</button>
          <button onClick={() => setStep("confirm")} className="btn-primary flex-1">
            Review & Confirm
          </button>
        </div>
      </div>
    );
  }

  // Step: Confirm
  if (step === "confirm") {
    const validMigrations = migrations.filter(
      m => m.campaignId && m.campaignTitle && m.sourcePlatform && m.grossAmount > 0
    );
    const selected = PAYOUT_OPTIONS.find(o => o.method === payoutMethod);
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-iftext">Confirm Migration</h3>
          <p className="text-[10px] text-ifmuted mt-0.5">Review before processing</p>
        </div>

        <div className="card space-y-2">
          {validMigrations.map((m, i) => (
            <div key={i} className="flex justify-between text-xs border-b border-ifborder pb-1 last:border-0 last:pb-0">
              <span className="text-ifmuted truncate max-w-[55%]">{m.campaignTitle} ← {m.sourcePlatform}</span>
              <span className="text-iftext font-semibold">${m.grossAmount.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="card space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-ifmuted">Gross</span>
            <span className="text-iftext">${totalGross.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-ifmuted">Total Fees</span>
            <span className="text-ifred">-${(totalPlatformFee + totalProcessingFee).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-ifborder">
            <span className="font-bold text-iftext">Net Payout</span>
            <span className="font-bold text-ifgreen">${totalNet.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs pt-1">
            <span className="text-ifmuted">Via</span>
            <span className="text-ifaccent font-semibold">{selected?.label} → {selected?.hint}</span>
          </div>
        </div>

        {error && (
          <p className="text-xs text-ifred bg-ifred/10 rounded-xl px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2">
          <button onClick={() => setStep("payout")} className="btn-secondary flex-1">Back</button>
          <button onClick={handleSubmit} className="btn-primary flex-1">Process Migration</button>
        </div>
      </div>
    );
  }

  // Step: Result
  if (step === "result" && result) {
    return (
      <div className="space-y-4">
        <div className="text-center py-4 space-y-2">
          <div className="w-14 h-14 rounded-full bg-ifgreen/20 flex items-center justify-center mx-auto">
            <span className="text-3xl">✓</span>
          </div>
          <h3 className="text-base font-bold text-iftext">Migration Complete</h3>
          <p className="text-xs text-ifmuted">
            {result.totalMigrations} campaign{result.totalMigrations > 1 ? "s" : ""} migrated
          </p>
        </div>

        <div className="card space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-ifmuted">Total Migrated</span>
            <span className="font-bold text-iftext">{result.summary?.totalGross}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ifmuted">Total Fees</span>
            <span className="text-ifred">{result.summary?.totalFees}</span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-ifborder">
            <span className="font-bold text-iftext">Net to Owners</span>
            <span className="font-bold text-ifgreen">{result.summary?.totalNet}</span>
          </div>
        </div>

        <p className="text-[10px] text-ifmuted text-center">
          Payout requests created and destinations saved for campaign-owner payout.
        </p>

        <button
          onClick={() => { setStep("entries"); setResult(null); setMigrations([{ campaignId: "", campaignTitle: "", sourcePlatform: "", grossAmount: 0 }]); }}
          className="btn-secondary"
        >
          New Migration
        </button>
      </div>
    );
  }

  return null;
}
