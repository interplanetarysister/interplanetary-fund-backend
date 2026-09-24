/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

/**
 * Organizer Accounts — automated provisioning and management.
 *
 * Business rules
 * ──────────────
 * • Every campaign is assigned exactly ONE organizer identity (email + name).
 * • That organizer identity is used across ALL platforms where the campaign is posted.
 *   A different agent must never post a campaign on Platform B if a different agent already
 *   posted it on Platform A — the same organizerEmail is propagated everywhere.
 * • A new organizer account is provisioned when:
 *     (a) A platform signals that the current organizer has hit a posting/account limit.
 *     (b) The workload check detects that an organizer is managing more campaigns than
 *         the configured MAX_CAMPAIGNS_PER_ORGANIZER threshold.
 *     (c) A manual override is triggered by an admin.
 * • When a new organizer is provisioned for a campaign it replaces the previous one and
 *   the old record is retired (status → "retired").
 */

import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlatformCredential = {
  platform: string;
  accountEmail: string;
  accountName: string;
  credentialsStored: boolean;
  provisionedAt: string;
  status: string;
  limitReason?: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum campaigns a single organizer may manage before a new one is auto-provisioned. */
const MAX_CAMPAIGNS_PER_ORGANIZER = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Deterministically derive an organizer email from a campaign title + a numeric slot.
 * The output is stable so the same campaign always gets the same email on re-runs.
 *
 * Format:  organizer.<slug>.<slot>@interplanetaryfund.org
 *
 * This is a placeholder — in a real deployment the email provisioning would call
 * an external API (e.g. Google Workspace, Mailgun). The generated address is stored
 * in the DB so the UI can display it and human admins can act on it.
 */
function deriveOrganizerEmail(campaignTitle: string, slot: number): string {
  const slug = campaignTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return `organizer.${slug}.${slot}@interplanetaryfund.org`;
}

/** Simple deterministic password placeholder — must be rotated by admin before use. */
function derivePlaceholderPassword(email: string, createdAt: string): string {
  const datePart = createdAt.slice(0, 10).replace(/-/g, "");
  const namePart = email.split("@")[0].replace(/\./g, "").slice(0, 8);
  return `IF-${namePart}-${datePart}!`;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Get the active organizer account for a campaign. Returns null if none yet. */
export const getForCampaign = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    return await ctx.db
      .query("organizerAccounts")
      .withIndex("byCampaignId", (q) => q.eq("campaignId", campaignId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
  },
});

/** List all active organizer accounts. */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("organizerAccounts")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .collect();
  },
});

/** Get all organizer accounts (any status) for a campaign — useful for audit trail. */
export const getHistoryForCampaign = query({
  args: { campaignId: v.string() },
  handler: async (ctx, { campaignId }) => {
    return await ctx.db
      .query("organizerAccounts")
      .withIndex("byCampaignId", (q) => q.eq("campaignId", campaignId))
      .collect();
  },
});

/** Get unreported organizer accounts (for the midnight report email). */
export const getUnreported = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("organizerAccounts")
      .withIndex("byReported", (q) => q.eq("reported", false))
      .collect();
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Provision a new organizer account for a campaign.
 *
 * Steps:
 *  1. Retire any existing active organizer for this campaign.
 *  2. Determine the slot number (how many organizers this campaign has had).
 *  3. Derive a stable email + placeholder password.
 *  4. Insert the new organizerAccounts row.
 *  5. Mirror to accountsCreated (existing reporting table) for each platform.
 *
 * Returns the new organizer record.
 */
export const provisionForCampaign = mutation({
  args: {
    campaignId: v.string(),
    campaignTitle: v.string(),
    triggerReason: v.string(),  // "platform_limit" | "workload" | "manual"
    platforms: v.array(v.string()),
    limitedPlatform: v.optional(v.string()),
    limitReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // 1. Retire existing active organizer for this campaign
    const existing = await ctx.db
      .query("organizerAccounts")
      .withIndex("byCampaignId", (q) => q.eq("campaignId", args.campaignId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { status: "retired", updatedAt: now });
    }

    // 2. Count all previous organizers for this campaign to derive the slot
    const allPrevious = await ctx.db
      .query("organizerAccounts")
      .withIndex("byCampaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    const slot = allPrevious.length + 1;

    // 3. Derive email + placeholder password
    const organizerEmail = deriveOrganizerEmail(args.campaignTitle, slot);
    const organizerName = `Organizer ${slot} — ${args.campaignTitle.slice(0, 40)}`;

    // 4. Build per-platform credential records
    const platformCredentials = args.platforms.map((platform: string) => ({
      platform,
      accountEmail: organizerEmail,
      accountName: organizerName,
      credentialsStored: false,
      provisionedAt: now,
      status: platform === args.limitedPlatform ? "limited" : "active",
      limitReason: platform === args.limitedPlatform ? (args.limitReason ?? "platform_limit") : undefined,
    }));

    // 5. Insert new record
    const newId = await ctx.db.insert("organizerAccounts", {
      campaignId: args.campaignId,
      campaignTitle: args.campaignTitle,
      organizerEmail,
      organizerName,
      platformCredentials,
      triggerReason: args.triggerReason,
      status: "active",
      createdAt: now,
      updatedAt: now,
      reported: false,
    });

    // 6. Mirror each platform to accountsCreated for backward-compat reporting
    for (const platform of args.platforms) {
      await ctx.db.insert("accountsCreated", {
        platform,
        accountEmail: organizerEmail,
        accountName: organizerName,
        purpose: `Organizer account (slot ${slot}) for campaign "${args.campaignTitle}" — trigger: ${args.triggerReason}`,
        campaignId: args.campaignId,
        credentialsStored: false,
        createdAt: now,
        reported: false,
      });
    }

    return {
      organizerAccountId: newId,
      organizerEmail,
      organizerName,
      slot,
      placeholderPassword: derivePlaceholderPassword(organizerEmail, now),
      platformCredentials,
    };
  },
});

/**
 * Update the status of a specific platform credential within an organizer account.
 * Use this when a platform reports a limit or the account is suspended.
 */
export const updatePlatformCredentialStatus = mutation({
  args: {
    organizerAccountId: v.id("organizerAccounts"),
    platform: v.string(),
    status: v.string(),          // "active" | "suspended" | "limited"
    limitReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.organizerAccountId);
    if (!account) throw new Error("Organizer account not found");

    const updatedCredentials = account.platformCredentials.map((cred: PlatformCredential) =>
      cred.platform === args.platform
        ? { ...cred, status: args.status, limitReason: args.limitReason }
        : cred
    );

    await ctx.db.patch(args.organizerAccountId, {
      platformCredentials: updatedCredentials,
      updatedAt: new Date().toISOString(),
    });
    return { status: "updated" };
  },
});

/**
 * Mark organizer accounts as reported (for the midnight report).
 */
export const markReported = mutation({
  args: {
    accountIds: v.array(v.id("organizerAccounts")),
    reportDate: v.string(),
  },
  handler: async (ctx, args) => {
    for (const id of args.accountIds) {
      await ctx.db.patch(id, { reported: true, reportDate: args.reportDate });
    }
    return { reported: args.accountIds.length };
  },
});

// ─── Internal — Automated Trigger ─────────────────────────────────────────────

/**
 * Internal query: return campaign IDs that need a new organizer account.
 * Reasons:
 *   (a) An active organizer has a platform credential in "limited" status.
 *   (b) An organizer account is assigned to more campaigns than MAX_CAMPAIGNS_PER_ORGANIZER
 *       (detected by email reuse — this shouldn't happen with the current 1-per-campaign model
 *        but guards future changes).
 */
export const detectProvisioningNeeds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allActive = await ctx.db
      .query("organizerAccounts")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .collect();

    // (a) Campaigns where any platform credential is "limited" — need new organizer
    const limitedCampaignIds = new Set<string>();
    for (const acct of allActive) {
      const hasLimit = acct.platformCredentials.some((c: PlatformCredential) => c.status === "limited");
      if (hasLimit) limitedCampaignIds.add(acct.campaignId);
    }

    // (b) Detect organizer email reuse across more campaigns than the threshold
    const emailCountMap = new Map<string, string[]>();
    for (const acct of allActive) {
      const existing = emailCountMap.get(acct.organizerEmail) ?? [];
      existing.push(acct.campaignId);
      emailCountMap.set(acct.organizerEmail, existing);
    }
    const overloadedCampaignIds = new Set<string>();
    for (const [, campaignIds] of emailCountMap) {
      if (campaignIds.length > MAX_CAMPAIGNS_PER_ORGANIZER) {
        campaignIds.forEach((id) => overloadedCampaignIds.add(id));
      }
    }

    return {
      limitedCampaignIds: [...limitedCampaignIds],
      overloadedCampaignIds: [...overloadedCampaignIds],
    };
  },
});

/**
 * Internal mutation: auto-provision organizer accounts for campaigns that need them.
 *
 * Called daily by crons.ts. For each campaign needing a new organizer:
 *   1. Look up the campaign's active platforms from externalPlatforms.
 *   2. Call provisionForCampaign to create the new identity.
 */
export const autoProvisionNeeded = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const provisioned: Array<{ campaignId: string; reason: string; organizerEmail: string }> = [];

    // --- (a) Platform-limited campaigns ---
    const allActive = await ctx.db
      .query("organizerAccounts")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .collect();

    const limitedAccounts = allActive.filter((acct) =>
      acct.platformCredentials.some((c: PlatformCredential) => c.status === "limited")
    );

    for (const acct of limitedAccounts) {
      // Fetch current platforms for this campaign
      const platformRows = await ctx.db
        .query("externalPlatforms")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", acct.campaignId))
        .collect();
      const platforms = platformRows.length > 0
        ? platformRows.map((p) => p.platform)
        : acct.platformCredentials.map((c: PlatformCredential) => c.platform);

      // Fetch campaign title
      const campaign = await ctx.db
        .query("monitoredCampaigns")
        .withIndex("byIfId", (q) => q.eq("ifCampaignId", acct.campaignId))
        .first();
      const campaignTitle = campaign?.title ?? acct.campaignTitle;

      // Retire old organizer
      await ctx.db.patch(acct._id, { status: "retired", updatedAt: now });

      // Count previous organizers for slot
      const allForCampaign = await ctx.db
        .query("organizerAccounts")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", acct.campaignId))
        .collect();
      const slot = allForCampaign.length;

      const organizerEmail = deriveOrganizerEmail(campaignTitle, slot);
      const organizerName = `Organizer ${slot} — ${campaignTitle.slice(0, 40)}`;

      const platformCredentials = platforms.map((platform: string) => ({
        platform,
        accountEmail: organizerEmail,
        accountName: organizerName,
        credentialsStored: false,
        provisionedAt: now,
        status: "active" as const,
        limitReason: undefined,
      }));

      const newId = await ctx.db.insert("organizerAccounts", {
        campaignId: acct.campaignId,
        campaignTitle,
        organizerEmail,
        organizerName,
        platformCredentials,
        triggerReason: "platform_limit",
        status: "active",
        createdAt: now,
        updatedAt: now,
        reported: false,
      });

      // Mirror to accountsCreated
      for (const platform of platforms) {
        await ctx.db.insert("accountsCreated", {
          platform,
          accountEmail: organizerEmail,
          accountName: organizerName,
          purpose: `Auto-provisioned organizer (slot ${slot}, platform_limit) for campaign "${campaignTitle}"`,
          campaignId: acct.campaignId,
          credentialsStored: false,
          createdAt: now,
          reported: false,
        });
      }

      provisioned.push({ campaignId: acct.campaignId, reason: "platform_limit", organizerEmail });
    }

    // --- (b) Campaigns with no organizer yet (new campaigns) ---
    // Find active campaigns that have no organizer account at all
    const allCampaigns = await ctx.db
      .query("monitoredCampaigns")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .collect();

    for (const campaign of allCampaigns) {
      const existing = await ctx.db
        .query("organizerAccounts")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
      if (existing) continue;  // already has one

      const platformRows = await ctx.db
        .query("externalPlatforms")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .collect();
      if (platformRows.length === 0) continue;  // no platforms yet — skip

      const platforms = platformRows.map((p) => p.platform);

      const allForCampaign = await ctx.db
        .query("organizerAccounts")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
        .collect();
      const slot = allForCampaign.length + 1;

      const organizerEmail = deriveOrganizerEmail(campaign.title, slot);
      const organizerName = `Organizer ${slot} — ${campaign.title.slice(0, 40)}`;

      const platformCredentials = platforms.map((platform: string) => ({
        platform,
        accountEmail: organizerEmail,
        accountName: organizerName,
        credentialsStored: false,
        provisionedAt: now,
        status: "active" as const,
        limitReason: undefined,
      }));

      await ctx.db.insert("organizerAccounts", {
        campaignId: campaign.ifCampaignId,
        campaignTitle: campaign.title,
        organizerEmail,
        organizerName,
        platformCredentials,
        triggerReason: "workload",
        status: "active",
        createdAt: now,
        updatedAt: now,
        reported: false,
      });

      for (const platform of platforms) {
        await ctx.db.insert("accountsCreated", {
          platform,
          accountEmail: organizerEmail,
          accountName: organizerName,
          purpose: `Auto-provisioned organizer (slot ${slot}, initial) for campaign "${campaign.title}"`,
          campaignId: campaign.ifCampaignId,
          credentialsStored: false,
          createdAt: now,
          reported: false,
        });
      }

      provisioned.push({ campaignId: campaign.ifCampaignId, reason: "workload", organizerEmail });
    }

    return { provisioned: provisioned.length, details: provisioned };
  },
});
