/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { ProtocolReport } from "../types/convex";

export interface UseLatestReportResult {
  report: ProtocolReport | null;
  isLoading: boolean;
}

export interface UseReportsResult {
  reports: ProtocolReport[] | null;
  isLoading: boolean;
}

/** Subscribe to the latest protocol audit report. */
export function useLatestReport(): UseLatestReportResult {
  const report = useQuery(api.protocol.getLatestReport, {}) as ProtocolReport | undefined;
  return {
    report: report ?? null,
    isLoading: report === undefined,
  };
}

/** Subscribe to the N most recent protocol reports. */
export function useReports(limit = 10): UseReportsResult {
  const reports = useQuery(api.protocol.getReports, { limit }) as ProtocolReport[] | undefined;
  return {
    reports: reports ?? null,
    isLoading: reports === undefined,
  };
}
