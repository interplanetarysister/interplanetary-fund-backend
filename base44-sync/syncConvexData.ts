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
    if_campaign_id: camp.ifCampaignId,
    title: camp.title,
    status: camp.status,
    category: camp.category,
    goal_amount: camp.goalAmount,
    raised_amount: camp.raisedAmount,
    donor_count: camp.donorCount,
    outreach_enabled: camp.outreachEnabled,
    payment_active: camp.paymentActive,
    story_present: camp.storyPresent,
    cover_image_present: camp.coverImagePresent,
    summary: camp.summary,
    end_date: camp.endDate,
    ai_priority: camp.aiPriority,
    ai_tone: camp.aiTone,
    ai_ideal_donors: camp.aiIdealDonors,
    ai_interested_orgs: camp.aiInterestedOrgs,
    ai_platforms: camp.aiPlatforms,
    last_synced: new Date().toISOString(),
  });

  const mapPlatformData = (platform: any) => ({
    platform: platform.platform,
    kind: platform.kind,
    display_name: platform.displayName,
    external_url: platform.externalUrl || "",
    campaign_id: platform.campaignId,
    status: platform.status,
    automation_mode: platform.automationMode || "manual",
    credentials: platform.credentials || "",
    external_total: platform.externalTotal ?? 0,
    external_donor_count: platform.externalDonorCount ?? 0,
    last_synced: new Date().toISOString(),
    last_error: platform.lastError || "",
    history: platform.history || [],
  });

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
      const campaignsResponse = await convexQuery("campaigns:getCampaigns", {
        paginationOpts: { numItems: 500, cursor: null },
      });
      const campaigns = Array.isArray(campaignsResponse) ? campaignsResponse : (campaignsResponse?.page || []);
      for (const camp of campaigns) {
        const existing = await ctx.entities.MonitoredCampaign.filter({ if_campaign_id: camp.ifCampaignId }).list();
        const campData = mapCampaignData(camp);
        if (existing.length > 0) {
          await ctx.entities.MonitoredCampaign.update(existing[0]._id, campData);
        } else {
          await ctx.entities.MonitoredCampaign.create(campData);
        }
      }
      return { synced: campaigns.length, campaigns: campaigns.map(c => c.title) };
    }

    case "sync_platforms": {
      const platforms = await convexQuery("campaigns:getExternalPlatforms", {});
      const results = await Promise.all(platforms.map(async (platform: any) => {
        const existing = await ctx.entities.PlatformConnection.filter({
          campaign_id: platform.campaignId,
          platform: platform.platform,
        }).list();
        const platformData = mapPlatformData(platform);

        if (existing.length > 0) {
          await ctx.entities.PlatformConnection.update(existing[0]._id, platformData);
          return { platform: platform.platform, campaign_id: platform.campaignId, status: "updated" };
        }

        await ctx.entities.PlatformConnection.create(platformData);
        return { platform: platform.platform, campaign_id: platform.campaignId, status: "created" };
      }));

      return {
        synced: platforms.length,
        updated: results.filter((r) => r.status === "updated").length,
        created: results.filter((r) => r.status === "created").length,
        platforms: results,
      };
    }

    case "sync_treasury": {
      const balances = await convexQuery("treasury:aggregateBalances");
      const stats = await convexQuery("agents:getAgentStats");
      return { treasury: balances, agentStats: stats };
    }

    case "full_sync": {
      const [agents, campaignsResponse, platforms, balances, stats] = await Promise.all([
        convexQuery("agents:getAgents", {}),
        convexQuery("campaigns:getCampaigns", {
          paginationOpts: { numItems: 500, cursor: null },
        }),
        convexQuery("campaigns:getExternalPlatforms", {}),
        convexQuery("treasury:aggregateBalances", {}),
        convexQuery("agents:getAgentStats", {}),
      ]);
      const campaigns = Array.isArray(campaignsResponse) ? campaignsResponse : (campaignsResponse?.page || []);
      
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
        const existing = await ctx.entities.MonitoredCampaign.filter({ if_campaign_id: camp.ifCampaignId }).list();
        const campData = mapCampaignData(camp);
        if (existing.length > 0) {
          await ctx.entities.MonitoredCampaign.update(existing[0]._id, campData);
        } else {
          await ctx.entities.MonitoredCampaign.create(campData);
        }
      }

      // Sync platform connections to Base44 entities in parallel
      const platformResults = await Promise.all(platforms.map(async (platform: any) => {
        const existing = await ctx.entities.PlatformConnection.filter({
          campaign_id: platform.campaignId,
          platform: platform.platform,
        }).list();
        const platformData = mapPlatformData(platform);

        if (existing.length > 0) {
          await ctx.entities.PlatformConnection.update(existing[0]._id, platformData);
          return { status: "updated" };
        }

        await ctx.entities.PlatformConnection.create(platformData);
        return { status: "created" };
      }));

      return {
        agentsSynced: agents.length,
        campaignsSynced: campaigns.length,
        platformsSynced: platforms.length,
        platformsUpdated: platformResults.filter((r) => r.status === "updated").length,
        platformsCreated: platformResults.filter((r) => r.status === "created").length,
        treasury: balances,
        agentStats: stats,
        timestamp: new Date().toISOString(),
      };
    }

    default:
      return { error: "Unknown action. Use: sync_agents, sync_campaigns, sync_platforms, sync_treasury, or full_sync" };
  }
});
