/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const DEFAULTS = {
  cashapp: "$unrewound",
  paypal: "interplanetarysister@gmail.com",
};

export default function PayoutSelection() {
  const campaigns = useQuery(api.campaigns.getCampaigns, {});
  const [campaignId, setCampaignId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { method: "cashapp" | "paypal"; destination: string }>>({});

  const pending = useQuery(api.fundMigration.getPendingPayouts, {
    campaignId: campaignId || undefined,
  });
  const selectPayoutMethod = useMutation(api.fundMigration.selectPayoutMethod);

  const getDraft = (payoutId: string) =>
    drafts[payoutId] || { method: "cashapp" as const, destination: DEFAULTS.cashapp };

  const updateDraft = (payoutId: string, next: Partial<{ method: "cashapp" | "paypal"; destination: string }>) => {
    const current = getDraft(payoutId);
    setDrafts((prev) => ({
      ...prev,
      [payoutId]: { ...current, ...next },
    }));
  };

  const saveSelection = async (payout: any) => {
    setError(null);
    setStatus(null);
    const draft = getDraft(payout.payoutId);
    try {
      await selectPayoutMethod({
        payoutId: payout.payoutId,
        payoutMethod: draft.method,
        payoutDestination: draft.destination,
      });
      setStatus(`Saved payout method for ${payout.campaignTitle || payout.campaignId}.`);
    } catch (e: any) {
      setError(e?.message || "Failed to save payout method.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="page-title">Payout Selection</h2>
        <p className="page-subtitle">Campaign owners choose CashApp or PayPal for migrated funds.</p>
      </div>

      <div className="card space-y-2">
        <label className="text-xs text-ifmuted">Filter by campaign</label>
        <select
          className="input"
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
        >
          <option value="">All campaigns with pending payout selection</option>
          {((campaigns as any[]) || []).map((c: any) => (
            <option key={c.ifCampaignId} value={c.ifCampaignId}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {status && <p className="text-xs text-ifgreen bg-ifgreen/10 rounded-xl px-3 py-2">{status}</p>}
      {error && <p className="text-xs text-ifred bg-ifred/10 rounded-xl px-3 py-2">{error}</p>}

      {!pending && (
        <div className="card text-center py-8 text-ifmuted text-sm">Loading pending payouts...</div>
      )}

      {pending && pending.length === 0 && (
        <div className="card text-center py-8 text-ifmuted text-sm">No payouts waiting for selection.</div>
      )}

      {(pending || []).map((payout: any) => {
        const draft = getDraft(payout.payoutId);
        return (
          <div key={payout.payoutId} className="card space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-iftext">{payout.campaignTitle || payout.campaignId}</p>
                <p className="text-[10px] text-ifmuted">{payout.campaignId}</p>
              </div>
              <span className="badge badge-amber">Awaiting Selection</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-ifdark p-2">
                <p className="text-ifmuted">Gross</p>
                <p className="text-iftext font-semibold">${payout.grossAmount.toFixed(2)}</p>
              </div>
              <div className="rounded-lg bg-ifdark p-2">
                <p className="text-ifmuted">Fees</p>
                <p className="text-ifred font-semibold">-${payout.fees.toFixed(2)}</p>
              </div>
              <div className="rounded-lg bg-ifdark p-2">
                <p className="text-ifmuted">Net</p>
                <p className="text-ifgreen font-semibold">${payout.netAmount.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateDraft(payout.payoutId, { method: "cashapp", destination: DEFAULTS.cashapp })}
                className={`py-2 rounded-xl text-xs font-medium ${draft.method === "cashapp" ? "bg-ifgreen text-white" : "bg-ifdark text-ifmuted"}`}
              >
                CashApp
              </button>
              <button
                onClick={() => updateDraft(payout.payoutId, { method: "paypal", destination: DEFAULTS.paypal })}
                className={`py-2 rounded-xl text-xs font-medium ${draft.method === "paypal" ? "bg-ifcyan text-white" : "bg-ifdark text-ifmuted"}`}
              >
                PayPal
              </button>
            </div>

            <input
              className="input"
              value={draft.destination}
              onChange={(e) => updateDraft(payout.payoutId, { destination: e.target.value })}
              placeholder={draft.method === "cashapp" ? "$Cashtag" : "PayPal Email"}
            />

            <button
              onClick={() => saveSelection(payout)}
              disabled={!draft.destination}
              className="btn-primary disabled:opacity-50"
            >
              Save Payout Method
            </button>
          </div>
        );
      })}
    </div>
  );
}
