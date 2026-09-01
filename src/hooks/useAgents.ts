/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Agent, AgentStats } from "../types/convex";

export interface UseAgentsResult {
  agents: Agent[] | null;
  isLoading: boolean;
}

export interface UseAgentStatsResult {
  stats: AgentStats | null;
  isLoading: boolean;
}

/** Subscribe to the full agent list, optionally filtered by status. */
export function useAgents(status?: string): UseAgentsResult {
  const args = status ? { status } : {};
  const agents = useQuery(api.agents.getAgents, args) as Agent[] | undefined;
  return {
    agents: agents ?? null,
    isLoading: agents === undefined,
  };
}

/** Subscribe to the agent stats summary. */
export function useAgentStats(): UseAgentStatsResult {
  const stats = useQuery(api.agents.getAgentStats, {}) as AgentStats | undefined;
  return {
    stats: stats ?? null,
    isLoading: stats === undefined,
  };
}
