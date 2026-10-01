/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

// Status badge helper
function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "badge-green"
      : status === "error"
        ? "badge-red"
        : status === "paused"
          ? "badge-amber"
          : "badge-cyan";
  return <span className={`badge ${cls}`}>{status}</span>;
}

// Format a lastSynced ISO string to human-readable relative time
function formatLastSynced(iso: string | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

interface ExternalPlatformDashboardProps {
  /** Optionally filter to a single campaign's platforms */
  campaignId?: string;
}

export function ExternalPlatformDashboard({ campaignId }: ExternalPlatformDashboardProps) {
  // Individual platform records — Convex reactive, auto-refreshes on lastSynced change
  const platforms = useQuery(api.campaigns.getExternalPlatforms, campaignId ? { campaignId } : {});
  // Aggregated totals (all platforms, not filtered by campaignId)
  const balances = useQuery(api.campaigns.getAllExternalBalances, {});

  if (platforms === undefined || balances === undefined) {
    return (
      <div className="text-center text-ifmuted py-8 text-xs">Loading platform data…</div>
    );
  }

  if (platforms.length === 0) {
    return (
      <div className="card text-center py-6">
        <p className="text-2xl mb-2">🔗</p>
        <p className="text-sm text-ifmuted">No external platforms connected yet.</p>
        <p className="text-xs text-ifmuted mt-1">Connect a platform below to track donations across GoFundMe, Kickstarter, and more.</p>
      </div>
    );
  }

  // When filtered by campaign we compute local aggregates from the filtered set
  const totalRaised = campaignId
    ? platforms.reduce((s, p) => s + (p.externalTotal ?? 0), 0)
    : balances.grandTotalRaised;
  const totalDonors = campaignId
    ? platforms.reduce((s, p) => s + (p.externalDonorCount ?? 0), 0)
    : balances.grandTotalDonors;

  return (
    <div className="space-y-3">
      {/* Aggregate summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="stat-card">
          <p className="text-xs text-ifmuted font-medium">Total Raised</p>
          <p className="text-2xl font-bold text-ifcyan mt-1">
            ${totalRaised.toLocaleString()}
          </p>
          <p className="text-[10px] text-ifmuted mt-1">
            {platforms.length} platform{platforms.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-ifmuted font-medium">Total Donors</p>
          <p className="text-2xl font-bold text-ifgreen mt-1">
            {totalDonors.toLocaleString()}
          </p>
          <p className="text-[10px] text-ifmuted mt-1">Across all platforms</p>
        </div>
      </div>

      {/* Per-platform rows */}
      <div className="card">
        <h3 className="text-sm font-semibold text-iftext mb-3">Platform Breakdown</h3>
        <div className="space-y-2">
          {platforms.map((p) => (
            <div key={p._id} className="bg-ifdark rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-iftext truncate">
                    {p.displayName || p.platform}
                  </p>
                  <p className="text-[10px] text-ifmuted mt-0.5 truncate">
                    {p.platform}
                    {p.externalUrl ? (
                      <>
                        {" · "}
                        <a
                          href={p.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ifcyan underline"
                        >
                          View campaign ↗
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <StatusBadge status={p.status ?? "unknown"} />
              </div>

              {/* Metrics row */}
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <div className="bg-ifcard rounded-lg p-1.5">
                  <p className="text-xs font-bold text-ifcyan">
                    ${(p.externalTotal ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-ifmuted">Raised</p>
                </div>
                <div className="bg-ifcard rounded-lg p-1.5">
                  <p className="text-xs font-bold text-ifgreen">
                    {(p.externalDonorCount ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-ifmuted">Donors</p>
                </div>
                <div className="bg-ifcard rounded-lg p-1.5">
                  <p className="text-xs font-bold text-ifamber">
                    {formatLastSynced(p.lastSynced)}
                  </p>
                  <p className="text-[9px] text-ifmuted">Last sync</p>
                </div>
              </div>

              {/* Error message if any */}
              {p.lastError && (
                <p className="text-[10px] text-ifred mt-1.5 truncate">⚠ {p.lastError}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
