/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { TreasuryBalances, PayoutCalculation } from "../types/convex";

export interface UseTreasuryResult {
  balances: TreasuryBalances | null | undefined;
  isLoading: boolean;
}

export interface UsePayoutCalcResult {
  calc: PayoutCalculation | null | undefined;
  isLoading: boolean;
}

/** Subscribe to the live treasury balance aggregate. */
export function useTreasury(): UseTreasuryResult {
  const balances = useQuery(api.treasury.aggregateBalances, {}) as TreasuryBalances | undefined;
  return {
    balances: balances ?? null,
    isLoading: balances === undefined,
  };
}

/** Subscribe to the payout calculation for a given gross amount. */
export function usePayoutCalc(amount: number): UsePayoutCalcResult {
  const calc = useQuery(api.treasury.calculatePayout, { amount }) as PayoutCalculation | undefined;
  return {
    calc: calc ?? null,
    isLoading: calc === undefined,
  };
}
