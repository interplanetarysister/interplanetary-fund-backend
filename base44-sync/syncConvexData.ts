// syncConvexData.ts — Base44 backend function that syncs data from Convex to Base44 entities
// This allows the Base44 APK to display live Convex data without direct Convex connection.
// 
// Flow: Base44 APK → this function → Convex REST API → Base44 entities → APK UI
//
import { apiHandler } from '@base44/sdk';

const CONVEX_URL = "https://rosy-butterfly-2.convex.cloud";

async function convexQuery(path: string, args: Record<string, any> = {}) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });
  if (!res.ok) throw new Error(`Convex query failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== "success") throw new Error(data.message || "Convex error");
  return data.value;
}

export default apiHandler(async (ctx, input) => {
  const { action } = input || {};

  const mapCampaignData = (camp: any) => ({
    if_campaign_id: camp.ifCampaignId || camp.if_campaign_id,
    title: camp.title,
    status: camp.status,
    category: camp.category,
    goal_amount: camp.goalAmount ?? camp.goal_amount,
    raised_amount: camp.raisedAmount ?? camp.raised_amount,
    donor_count: camp.donorCount ?? camp.donor_count,
    outreach_enabled: camp.outreachEnabled ?? camp.outreach_enabled,
    payment_active: camp.paymentActive ?? camp.payment_active,
    story_present: camp.storyPresent ?? camp.story_present,
    cover_image_present: camp.coverImagePresent ?? camp.cover_image_present,
    summary: camp.summary,
    end_date: camp.endDate ?? camp.end_date,
    ai_priority: camp.aiPriority ?? camp.ai_priority,
    ai_tone: camp.aiTone ?? camp.ai_tone,
    ai_ideal_donors: camp.aiIdealDonors ?? camp.ai_ideal_donors,
    ai_interested_orgs: camp.aiInterestedOrgs ?? camp.ai_interested_orgs,
    ai_platforms: camp.aiPlatforms ?? camp.ai_platforms,
    last_synced: new Date().toISOString(),
  });

  const mapPlatformData = (platform: any) => ({
    platform: platform.platform,
    kind: platform.kind,
    display_name: platform.displayName || platform.display_name,
    external_url: platform.externalUrl || platform.external_url || "",
    campaign_id: platform.campaignId || platform.campaign_id,
    status: platform.status,
    automation_mode: platform.automationMode || platform.automation_mode || "manual",
    external_total: platform.externalTotal ?? platform.external_total ?? 0,
    external_donor_count: platform.externalDonorCount ?? platform.external_donor_count ?? 0,
    last_synced: new Date().toISOString(),
    last_error: platform.lastError || platform.last_error || "",
    history: platform.history || [],
  });

  const normalizeList = (value: any) => (
    Array.isArray(value) ? value : (value?.page || [])
  );

  const getCampaignIfId = (camp: any) => camp.ifCampaignId || camp.if_campaign_id;
  const getPlatformCampaignId = (platform: any) => platform.campaignId || platform.campaign_id;
  const getPlatformName = (platform: any) => platform.platform;
  const summarizePlatformResults = (results: Array<{ status: string }>) => (
    results.reduce((acc, result) => {
      if (result.status === "updated") acc.updated += 1;
      if (result.status === "created") acc.created += 1;
      return acc;
    }, { updated: 0, created: 0 })
  );
  const fetchAllCampaigns = async () => {
    const allCampaigns: any[] = [];
    let cursor: string | null = null;
    let isDone = false;
    let pagesFetched = 0;
    const maxPages = 100;

    while (!isDone && pagesFetched < maxPages) {
      const previousLength = allCampaigns.length;
      const response = await convexQuery("campaigns:getCampaigns", {
        paginationOpts: { numItems: 500, cursor },
      });
      pagesFetched += 1;
      if (Array.isArray(response)) {
        allCampaigns.push(...response);
        break;
      }
      allCampaigns.push(...normalizeList(response));
      isDone = !!response?.isDone;
      cursor = response?.continueCursor || null;
      if (allCampaigns.length === previousLength) {
        isDone = true;
      }
      if (!cursor) isDone = true;
    }

    return allCampaigns;
  };

  const syncPlatformsParallel = async (platforms: any[]) => {
    const results: Array<{ platform: string; campaign_id: string; status: string }> = [];
    const batchSize = 10;
    const dedupedPlatforms = Array.from(
      new Map(platforms.map((platform: any) => [`${getPlatformCampaignId(platform)}::${getPlatformName(platform)}`, platform])).values()
    );

    for (let i = 0; i < dedupedPlatforms.length; i += batchSize) {
      const batch = dedupedPlatforms.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async (platform: any) => {
        const existing = await ctx.entities.PlatformConnection.filter({
          campaign_id: getPlatformCampaignId(platform),
          platform: getPlatformName(platform),
        }).list();
        const platformData = mapPlatformData(platform);

        if (existing.length > 0) {
          await ctx.entities.PlatformConnection.update(existing[0]._id, platformData);
          await Promise.all(existing.slice(1).map((row: any) => ctx.entities.PlatformConnection.delete(row._id)));
          return { platform: getPlatformName(platform), campaign_id: getPlatformCampaignId(platform), status: "updated" };
        }

        await ctx.entities.PlatformConnection.create(platformData);
        return { platform: getPlatformName(platform), campaign_id: getPlatformCampaignId(platform), status: "created" };
      }));
      results.push(...batchResults);
    }

    return results;
  };

  switch (action) {
    case "sync_agents": {
      const agents = await convexQuery("agents:getAgents");
      for (const agent of agents) {
        const existing = await ctx.entities.Agent.filter({ name: agent.name }).list();
        const agentData = {
          name: agent.name,
          role: agent.role,
          purpose: agent.purpose,
          description: agent.description,
          specialization: agent.specialization,
          status: agent.status,
          trustScore: agent.trustScore,
          reliabilityScore: agent.reliabilityScore,
          efficiencyScore: agent.efficiencyScore,
          collaborationScore: agent.collaborationScore,
          tasksCompleted: agent.tasksCompleted,
          successfulOutcomes: agent.successfulOutcomes,
          failedOutcomes: agent.failedOutcomes,
          capabilities: agent.capabilities,
          knowledgeAreas: agent.knowledgeAreas,
          responsibilities: agent.responsibilities,
          allowedActions: agent.allowedActions,
          restrictedActions: agent.restrictedActions,
          permissions: agent.permissions,
          toolsAvailable: agent.toolsAvailable,
          workflowAccess: agent.workflowAccess,
          dataAccessLevel: agent.dataAccessLevel,
          approvalRequired: agent.approvalRequired,
          longTermMemory: agent.longTermMemory,
          workingMemory: agent.workingMemory,
          managedCampaigns: agent.managedCampaigns,
          accentColor: agent.accentColor,
          version: agent.version,
        };
        if (existing.length > 0) {
          await ctx.entities.Agent.update(existing[0]._id, agentData);
        } else {
          await ctx.entities.Agent.create(agentData);
        }
      }
      return { synced: agents.length, agents: agents.map(a => a.name) };
    }

    case "sync_campaigns": {
      const campaigns = await fetchAllCampaigns();
      for (const camp of campaigns) {
        const existing = await ctx.entities.MonitoredCampaign.filter({ if_campaign_id: getCampaignIfId(camp) }).list();
        const campData = mapCampaignData(camp);
        if (existing.length > 0) {
          await ctx.entities.MonitoredCampaign.update(existing[0]._id, campData);
          await Promise.all(existing.slice(1).map((row: any) => ctx.entities.MonitoredCampaign.delete(row._id)));
        } else {
          await ctx.entities.MonitoredCampaign.create(campData);
        }
      }
      return { synced: campaigns.length, campaigns: campaigns.map(c => c.title) };
    }

    case "sync_platforms": {
      const platformsResponse = await convexQuery("campaigns:getExternalPlatforms", {});
      const platforms = normalizeList(platformsResponse);
      const results = await syncPlatformsParallel(platforms);
      const platformSummary = summarizePlatformResults(results);

      return {
        synced: platforms.length,
        updated: platformSummary.updated,
        created: platformSummary.created,
        platforms: results,
      };
    }

    case "sync_treasury": {
      const balances = await convexQuery("treasury:aggregateBalances");
      const stats = await convexQuery("agents:getAgentStats");
      return { treasury: balances, agentStats: stats };
    }

    case "full_sync": {
      const [agents, platforms, balances, stats, campaigns] = await Promise.all([
        convexQuery("agents:getAgents", {}),
        convexQuery("campaigns:getExternalPlatforms", {}),
        convexQuery("treasury:aggregateBalances", {}),
        convexQuery("agents:getAgentStats", {}),
        fetchAllCampaigns(),
      ]);
      const normalizedPlatforms = normalizeList(platforms);
      
      // Sync agents to Base44 entities
      for (const agent of agents) {
        const existing = await ctx.entities.Agent.filter({ name: agent.name }).list();
        const agentData = {
          name: agent.name,
          role: agent.role,
          purpose: agent.purpose,
          description: agent.description,
          specialization: agent.specialization,
          status: agent.status,
          trustScore: agent.trustScore,
          reliabilityScore: agent.reliabilityScore,
          efficiencyScore: agent.efficiencyScore,
          collaborationScore: agent.collaborationScore,
          tasksCompleted: agent.tasksCompleted,
          successfulOutcomes: agent.successfulOutcomes,
          failedOutcomes: agent.failedOutcomes,
          capabilities: agent.capabilities,
          knowledgeAreas: agent.knowledgeAreas,
          responsibilities: agent.responsibilities,
          allowedActions: agent.allowedActions,
          restrictedActions: agent.restrictedActions,
          permissions: agent.permissions,
          toolsAvailable: agent.toolsAvailable,
          workflowAccess: agent.workflowAccess,
          dataAccessLevel: agent.dataAccessLevel,
          approvalRequired: agent.approvalRequired,
          longTermMemory: agent.longTermMemory,
          workingMemory: agent.workingMemory,
          managedCampaigns: agent.managedCampaigns,
          accentColor: agent.accentColor,
          version: agent.version,
        };
        if (existing.length > 0) {
          await ctx.entities.Agent.update(existing[0]._id, agentData);
        } else {
          await ctx.entities.Agent.create(agentData);
        }
      }

      // Sync campaigns to Base44 entities
      for (const camp of campaigns) {
        const existing = await ctx.entities.MonitoredCampaign.filter({ if_campaign_id: getCampaignIfId(camp) }).list();
        const campData = mapCampaignData(camp);
        if (existing.length > 0) {
          await ctx.entities.MonitoredCampaign.update(existing[0]._id, campData);
          await Promise.all(existing.slice(1).map((row: any) => ctx.entities.MonitoredCampaign.delete(row._id)));
        } else {
          await ctx.entities.MonitoredCampaign.create(campData);
        }
      }

      // Sync platform connections to Base44 entities in parallel
      const platformResults = await syncPlatformsParallel(normalizedPlatforms);
      const platformSummary = summarizePlatformResults(platformResults);

      return {
        agentsSynced: agents.length,
        campaignsSynced: campaigns.length,
        platformsSynced: normalizedPlatforms.length,
        platformsUpdated: platformSummary.updated,
        platformsCreated: platformSummary.created,
        treasury: balances,
        agentStats: stats,
        timestamp: new Date().toISOString(),
      };
    }

    default:
      return { error: "Unknown action. Use: sync_agents, sync_campaigns, sync_platforms, sync_treasury, or full_sync" };
  }
});
