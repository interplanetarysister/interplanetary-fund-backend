/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useTreasury } from "../hooks/useTreasury";
import { useAgentStats } from "../hooks/useAgents";
import { useLatestReport } from "../hooks/useProtocol";
import { DataGuard } from "../components/DataGuard";
import type { ProtocolViolation } from "../types/convex";

export default function Dashboard() {
  const { balances, isLoading: balancesLoading } = useTreasury();
  const { stats: agents, isLoading: agentsLoading } = useAgentStats();
  const { report: latestReport } = useLatestReport();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="page-title">Dashboard</h2>
        <p className="page-subtitle">Live overview across all platforms</p>
      </div>

      {/* Revenue Summary */}
      <DataGuard data={balances} isLoading={balancesLoading || agentsLoading}>
        {(b) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="stat-card">
                <p className="text-xs text-ifmuted font-medium">Total Raised</p>
                <p className="text-2xl font-bold text-ifcyan mt-1">
                  ${b.grandTotal.raised.toLocaleString()}
                </p>
                <p className="text-[10px] text-ifmuted mt-1">All platforms combined</p>
              </div>
              <div className="stat-card">
                <p className="text-xs text-ifmuted font-medium">Held in Treasury</p>
                <p className="text-2xl font-bold text-ifaccent mt-1">
                  ${b.holdingAccounts.totalHeld.toLocaleString()}
                </p>
                <p className="text-[10px] text-ifmuted mt-1">Before fees</p>
              </div>
              <div className="stat-card">
                <p className="text-xs text-ifmuted font-medium">Total Donors</p>
                <p className="text-2xl font-bold text-ifgreen mt-1">
                  {b.grandTotal.donors.toLocaleString()}
                </p>
              </div>
              <div className="stat-card">
                <p className="text-xs text-ifmuted font-medium">Paid Out</p>
                <p className="text-2xl font-bold text-ifamber mt-1">
                  ${b.holdingAccounts.totalPaidOut.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Campaigns Summary */}
            <div className="card">
              <h3 className="text-sm font-semibold text-iftext mb-3">Campaigns</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xl font-bold text-iftext">{b.localCampaigns.count}</p>
                  <p className="text-[10px] text-ifmuted">Total</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-ifgreen">{b.localCampaigns.active}</p>
                  <p className="text-[10px] text-ifmuted">Active</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-ifamber">{b.localCampaigns.draft}</p>
                  <p className="text-[10px] text-ifmuted">Draft</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-ifborder">
                <div className="flex justify-between text-xs">
                  <span className="text-ifmuted">Local Raised</span>
                  <span className="text-iftext font-medium">${b.localCampaigns.totalRaised.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-ifmuted">External Raised</span>
                  <span className="text-iftext font-medium">${b.externalPlatforms.totalRaised.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-ifmuted">Total Goal</span>
                  <span className="text-iftext font-medium">${b.localCampaigns.totalGoal.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </DataGuard>

      {/* Agents Summary */}
      <DataGuard data={agents} isLoading={agentsLoading}>
        {(a) => (
          <div className="card">
            <h3 className="text-sm font-semibold text-iftext mb-3">Agent Roster</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-ifaccent">{a.total}</p>
                <p className="text-[10px] text-ifmuted">Total Agents</p>
              </div>
              <div>
                <p className="text-xl font-bold text-ifgreen">{a.active}</p>
                <p className="text-[10px] text-ifmuted">Active</p>
              </div>
              <div>
                <p className="text-xl font-bold text-ifcyan">{a.averageTrust.toFixed(0)}</p>
                <p className="text-[10px] text-ifmuted">Avg Trust</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {a.agents.map((agent) => (
                <div key={agent.role} className="flex items-center justify-between text-xs">
                  <span className="text-iftext">{agent.name}</span>
                  <span className="badge badge-green">Trust {agent.trustScore}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DataGuard>

      {/* Latest Audit */}
      {latestReport && (
        <div className="card">
          <h3 className="text-sm font-semibold text-iftext mb-3">Latest Audit</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-lg font-bold text-ifgreen">{latestReport.compliantCampaigns}</p>
              <p className="text-[10px] text-ifmuted">Compliant</p>
            </div>
            <div>
              <p className="text-lg font-bold text-ifred">{latestReport.nonCompliantCampaigns}</p>
              <p className="text-[10px] text-ifmuted">Non-Compliant</p>
            </div>
          </div>
          {latestReport.criticalViolations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-ifborder">
              <p className="text-xs text-ifred font-medium mb-1">
                ⚠ {latestReport.criticalViolations.length} Critical Violations
              </p>
              {latestReport.criticalViolations.map((v: ProtocolViolation, i: number) => (
                <p key={i} className="text-[10px] text-ifmuted">
                  {v.standard}: {v.issue}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Credit-Free Badge */}
      <div className="text-center py-2">
        <p className="text-[10px] text-ifmuted">
          ⚡ Running credit-free on Convex · Zero Base44 credits
        </p>
      </div>
    </div>
  );
}
