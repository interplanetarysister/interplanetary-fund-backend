/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Campaign, CampaignStats, ExternalPlatform } from "../types/convex";

export interface UseCampaignStatsResult {
  stats: CampaignStats | null;
  isLoading: boolean;
}

export interface UseExternalBalancesResult {
  platforms: ExternalPlatform[] | null;
  isLoading: boolean;
}

export interface UsePaginatedCampaignsResult {
  campaigns: Campaign[];
  status: "LoadingFirstPage" | "LoadingMore" | "CanLoadMore" | "Exhausted";
  loadMore: (n: number) => void;
}

/** Subscribe to campaign count + raised/donor stats. */
export function useCampaignStats(): UseCampaignStatsResult {
  const stats = useQuery(api.campaigns.getCampaignStats, {}) as CampaignStats | undefined;
  return {
    stats: stats ?? null,
    isLoading: stats === undefined,
  };
}

/** Paginated subscription to campaigns filtered by status. */
export function usePaginatedCampaigns(
  status: "active" | "draft" | "completed" | "archived" | undefined,
  initialNumItems = 8,
): UsePaginatedCampaignsResult {
  const args = status ? { status } : {};
  const { results, status: pStatus, loadMore } = usePaginatedQuery(
    api.campaigns.getCampaigns,
    args,
    { initialNumItems },
  );
  return {
    campaigns: results as Campaign[],
    status: pStatus,
    loadMore,
  };
}

/** Subscribe to all external platform balances. */
export function useExternalBalances(): UseExternalBalancesResult {
  const platforms = useQuery(api.campaigns.getAllExternalBalances, {}) as ExternalPlatform[] | undefined;
  return {
    platforms: platforms ?? null,
    isLoading: platforms === undefined,
  };
}
