/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { type ReactNode } from "react";

interface DataGuardProps<T> {
  data: T | null | undefined;
  isLoading?: boolean;
  loadingLabel?: string;
  errorMessage?: string;
  children: (data: T) => ReactNode;
}

/**
 * Standardized loading / error wrapper for Convex query results.
 * Eliminates copy-pasted `if (!data) return <div>Loading...</div>` blocks.
 *
 * Usage:
 *   <DataGuard data={balances} isLoading={isLoading}>
 *     {(balances) => <p>{balances.grandTotal.raised}</p>}
 *   </DataGuard>
 */
export function DataGuard<T>({
  data,
  isLoading,
  loadingLabel = "Loading…",
  errorMessage,
  children,
}: DataGuardProps<T>) {
  if (data === undefined || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex gap-2">
          <span className="w-2 h-2 rounded-full bg-ifcyan animate-pulse-glow" />
          <span className="w-2 h-2 rounded-full bg-ifaccent animate-pulse-glow" style={{ animationDelay: "0.2s" }} />
          <span className="w-2 h-2 rounded-full bg-ifcyan animate-pulse-glow" style={{ animationDelay: "0.4s" }} />
        </div>
        <span className="sr-only">{loadingLabel}</span>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="text-center py-10 text-ifmuted text-sm">
        {errorMessage ?? "No data available."}
      </div>
    );
  }

  return <>{children(data)}</>;
}
