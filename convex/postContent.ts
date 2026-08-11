/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const BUSINESS_EMAIL = "interplanetarysister@gmail.com";
const IF_APP_BASE_URL = "https://interplanetary-fund.vercel.app";
const IF_APP_HOST = new URL(IF_APP_BASE_URL).host;
const BASE44_APP_HOST = new URL("https://base44-dispatcher-production.base44.workers.dev").host;
const ORGANIZER_EMAIL = "cuddlemeplatonically@gmail.com";

function generatePayPalLink(campaignTitle: string): string {
  const params = new URLSearchParams({
    cmd: "_donations",
    business: BUSINESS_EMAIL,
    item_name: `${campaignTitle} - Interplanetary Fund`,
    currency_code: "USD",
  });
  return `https://www.paypal.com/donate/?${params.toString()}`;
}

function generateIFCampaignUrl(campaignId: string): string {
  return `${IF_APP_BASE_URL}/campaign/${campaignId}`;
}

function textContainsHost(content: string | undefined, expectedHost: string): boolean {
  if (!content) {
    return false;
  }

  const urls = content.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  return urls.some((url) => {
    try {
      return new URL(url).host === expectedHost;
    } catch {
      return false;
    }
  });
}

// Platform-specific constraints for full campaign listings (issue #13)
const PLATFORM_LISTING_CONSTRAINTS: Record<string, { titleMax: number; descMax: number; allowsDonateLink: boolean }> = {
  gofundme:     { titleMax: 100, descMax: 3000, allowsDonateLink: false },
  kickstarter:  { titleMax: 60,  descMax: 1350, allowsDonateLink: false },
  indiegogo:    { titleMax: 100, descMax: 5000, allowsDonateLink: true  },
  givesendgo:   { titleMax: 100, descMax: 5000, allowsDonateLink: true  },
  fundrazr:     { titleMax: 100, descMax: 3000, allowsDonateLink: true  },
  spotfund:     { titleMax: 80,  descMax: 1000, allowsDonateLink: false },
  buymeacoffee: { titleMax: 100, descMax: 2000, allowsDonateLink: true  },
  patreon:      { titleMax: 100, descMax: 5000, allowsDonateLink: true  },
  "ko-fi":      { titleMax: 100, descMax: 2000, allowsDonateLink: true  },
  facebook:     { titleMax: 255, descMax: 5000, allowsDonateLink: true  },
  bluesky:      { titleMax: 300, descMax: 300,  allowsDonateLink: true  },
};

// Detailed per-platform rules for the organizer listing pipeline (issue #13)
const PLATFORM_RULES: Record<string, {
  maxTitleLength: number;
  allowsPayPalLink: boolean;
  defaultCategory: string;
  imageRequirement: string;
  automationMode: "auto" | "manual";
}> = {
  gofundme: {
    maxTitleLength: 60,
    allowsPayPalLink: true,
    defaultCategory: "emergency",
    imageRequirement: "1 hero image (recommended 1200x628)",
    automationMode: "manual",
  },
  kickstarter: {
    maxTitleLength: 60,
    allowsPayPalLink: false,
    defaultCategory: "creative",
    imageRequirement: "campaign image + project gallery",
    automationMode: "manual",
  },
  indiegogo: {
    maxTitleLength: 80,
    allowsPayPalLink: true,
    defaultCategory: "innovation",
    imageRequirement: "main image + optional media",
    automationMode: "manual",
  },
  givesendgo: {
    maxTitleLength: 70,
    allowsPayPalLink: true,
    defaultCategory: "faith",
    imageRequirement: "campaign image recommended",
    automationMode: "manual",
  },
  fundrazr: {
    maxTitleLength: 80,
    allowsPayPalLink: true,
    defaultCategory: "charity",
    imageRequirement: "cover image recommended",
    automationMode: "manual",
  },
  spotfund: {
    maxTitleLength: 70,
    allowsPayPalLink: true,
    defaultCategory: "community",
    imageRequirement: "mobile-friendly square/portrait image",
    automationMode: "manual",
  },
  buymeacoffee: {
    maxTitleLength: 80,
    allowsPayPalLink: true,
    defaultCategory: "support",
    imageRequirement: "profile + post image optional",
    automationMode: "manual",
  },
  patreon: {
    maxTitleLength: 80,
    allowsPayPalLink: true,
    defaultCategory: "membership",
    imageRequirement: "banner + tier images optional",
    automationMode: "manual",
  },
  kofi: {
    maxTitleLength: 80,
    allowsPayPalLink: true,
    defaultCategory: "support",
    imageRequirement: "profile + gallery image optional",
    automationMode: "manual",
  },
  facebook: {
    maxTitleLength: 120,
    allowsPayPalLink: true,
    defaultCategory: "social",
    imageRequirement: "feed image/video",
    automationMode: "auto",
  },
  bluesky: {
    maxTitleLength: 300,
    allowsPayPalLink: true,
    defaultCategory: "social",
    imageRequirement: "single attached image recommended",
    automationMode: "auto",
  },
};

function normalizePlatform(platform: string): string {
  return platform.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function buildPlatformListing({
  campaignId,
  campaignTitle,
  campaignSummary,
  platform,
  customMessage,
}: {
  campaignId: string;
  campaignTitle: string;
  campaignSummary?: string;
  platform: string;
  customMessage?: string;
}) {
  const normalized = normalizePlatform(platform);
  const rules = PLATFORM_RULES[normalized] || PLATFORM_RULES.facebook;
  const paypalLink = generatePayPalLink(campaignTitle);
  const ifCampaignUrl = generateIFCampaignUrl(campaignId);
  const listingTitle = truncateTitle(campaignTitle, rules.maxTitleLength);
  const baseDescription = customMessage?.trim() || campaignSummary?.trim() || "We're raising funds to make a real difference in our community.";
  const organizerLine = `Organizer account: ${ORGANIZER_EMAIL}`;
  const description = [
    `Campaign: ${listingTitle}`,
    "",
    baseDescription,
    "",
    "How funds are handled:",
    "• Donations are received on this platform",
    "• Interplanetary Fund coordinates transfer to IF PayPal business account",
    "• IF processing: 5% platform fee + 2.9% + $0.30",
    "• Net funds are paid to the campaign owner via CashApp ($unrewound) or PayPal",
    "",
    organizerLine,
    `Campaign page: ${ifCampaignUrl}`,
    rules.allowsPayPalLink ? `IF PayPal donate link: ${paypalLink}` : "IF PayPal donate link: Not included on this platform",
  ].join("\n");

  return {
    platform: platform,
    normalizedPlatform: normalized,
    listingTitle,
    description,
    paypalLink: rules.allowsPayPalLink ? paypalLink : undefined,
    ifCampaignUrl,
    hasPayPalLink: rules.allowsPayPalLink,
    requirements: {
      maxTitleLength: rules.maxTitleLength,
      imageRequirement: rules.imageRequirement,
      category: rules.defaultCategory,
      automationMode: rules.automationMode,
    },
  };
}

// Generate campaign post content with embedded IF app URL (issue #8/#9)
export const generatePostContent = mutation({
  args: {
    campaignId: v.string(),
    campaignTitle: v.string(),
    platform: v.string(),
    customMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const paypalLink = generatePayPalLink(args.campaignTitle);
    const ifCampaignUrl = generateIFCampaignUrl(args.campaignId);

    let content = args.customMessage || "";

    if (!content) {
      content = `🚀 ${args.campaignTitle}\n\nWe're raising funds to make a real difference. Your support means everything.\n\nEvery dollar counts. Together we can reach our goal! 💪`;
    }

    // ALWAYS use IF app URL — funds must route through IF (issue #8)
    const donationBlock = `\n\n💝 Donate now: ${ifCampaignUrl}\nOr via PayPal: ${paypalLink}\nThank you for your support! 🙏`;

    const fullContent = content + donationBlock;
    const isFacebook = args.platform.toLowerCase().includes("facebook");

    // Increment link click tracking when content is served
    const platforms = await ctx.db
      .query("externalPlatforms")
      .withIndex("byCampaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    const platformRecord = platforms.find(
      (p) => p.platform.toLowerCase() === args.platform.toLowerCase()
    );
    if (platformRecord) {
      await ctx.db.patch(platformRecord._id, {
        linkClicks: (platformRecord.linkClicks || 0) + 1,
      });
    }

    return {
      content: fullContent,
      paypalLink,
      ifCampaignUrl,
      linkAttachment: isFacebook ? ifCampaignUrl : undefined,
      platform: args.platform,
      campaignId: args.campaignId,
      characterCount: fullContent.length,
      hasPayPalLink: true,
      hasIfUrl: true,
    };
  },
});

// Issue #13 — Generate a FULL campaign listing for a specific platform
export const generateFullListing = mutation({
  args: {
    campaignId: v.string(),
    campaignTitle: v.string(),
    campaignSummary: v.string(),
    campaignGoal: v.number(),
    campaignCategory: v.string(),
    coverImageUrl: v.optional(v.string()),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const constraints = PLATFORM_LISTING_CONSTRAINTS[args.platform.toLowerCase()] || {
      titleMax: 100, descMax: 3000, allowsDonateLink: true,
    };

    const paypalLink = generatePayPalLink(args.campaignTitle);
    const ifCampaignUrl = generateIFCampaignUrl(args.campaignId);

    const title = args.campaignTitle.slice(0, constraints.titleMax);

    let description = `${args.campaignSummary}\n\n`;
    description += `Goal: $${args.campaignGoal.toLocaleString()}\n`;
    description += `Category: ${args.campaignCategory}\n\n`;
    description += `Every contribution makes a difference. Together we can reach this goal!\n\n`;
    if (constraints.allowsDonateLink) {
      description += `💝 Donate & learn more: ${ifCampaignUrl}\n`;
      description += `PayPal: ${paypalLink}\n`;
    } else {
      description += `Thank you for your support!`;
    }
    description = description.slice(0, constraints.descMax);

    // Save as a distributed post with listingType = "full_listing"
    const postId = await ctx.db.insert("distributedPosts", {
      campaignId: args.campaignId,
      campaignTitle: args.campaignTitle,
      platform: args.platform.toLowerCase(),
      postType: "full_listing",
      content: description,
      paypalLink,
      ifCampaignUrl,
      listingType: "full_listing",
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    // Mark platform connection as full_listing
    const connectedPlatforms = await ctx.db
      .query("externalPlatforms")
      .withIndex("byCampaignId", (q) => q.eq("campaignId", args.campaignId))
      .collect();
    const platformRecord = connectedPlatforms.find(
      (p) => p.platform.toLowerCase() === args.platform.toLowerCase()
    );
    if (platformRecord) {
      await ctx.db.patch(platformRecord._id, {
        listingType: "full_listing",
        lastSynced: new Date().toISOString(),
      });
    }

    return {
      postId,
      title,
      description,
      ifCampaignUrl,
      paypalLink: constraints.allowsDonateLink ? paypalLink : null,
      platform: args.platform,
      characterCount: description.length,
      withinLimits: description.length <= constraints.descMax,
    };
  },
});

// Issue #9 — One-time migration: fix all existing DistributedPost URLs (Base44 → IF app)
export const fixDistributedPostUrls = mutation({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db.query("distributedPosts").collect();
    let fixed = 0;
    for (const post of posts) {
      const hasBase44Url = textContainsHost(post.content, BASE44_APP_HOST);
      const missingIfUrl = !textContainsHost(post.content, IF_APP_HOST);
      if (hasBase44Url || missingIfUrl) {
        const ifUrl = generateIFCampaignUrl(post.campaignId);
        let newContent = post.content || "";
        // Replace any Base44 URL
        newContent = newContent.replace(
          /https:\/\/base44-dispatcher-production\.base44\.workers\.dev\/campaign\/[^\s\n]*/g,
          ifUrl
        );
        // If still no IF app URL, append it
        if (!textContainsHost(newContent, IF_APP_HOST)) {
          newContent += `\n\n🔗 Campaign page: ${ifUrl}`;
        }
        await ctx.db.patch(post._id, {
          content: newContent,
          ifCampaignUrl: ifUrl,
        });
        fixed++;
      }
    }
    return { status: "success", postsChecked: posts.length, postsFixed: fixed };
  },
});

// Check all existing DistributedPosts for missing PayPal links or wrong URLs
export const auditPostLinks = query({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db.query("distributedPosts").collect();
    const missingPaypal = posts.filter((p) => {
      const rules = PLATFORM_RULES[normalizePlatform(p.platform)] || PLATFORM_RULES.facebook;
      if (!rules.allowsPayPalLink) return false;
      return !p.content || !p.content.includes("paypal.com/donate");
    });
    const wrongUrl = posts.filter(
      (p) => textContainsHost(p.content, BASE44_APP_HOST)
    );
    return {
      totalPosts: posts.length,
      postsWithPayPalLink: posts.length - missingPaypal.length,
      postsMissingLinks: missingPaypal.map((p) => ({
        id: p._id, campaign: p.campaignTitle || p.campaignId,
        platform: p.platform, action: "needs_regen",
      })),
      postsWithWrongUrl: wrongUrl.length,
      action: wrongUrl.length > 0 ? "run fixDistributedPostUrls" : "all_good",
    };
  },
});

// Fix posts that are missing PayPal links by appending them
export const fixMissingPayPalLinks = mutation({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db.query("distributedPosts").collect();
    const missingLinks = posts.filter((p) => {
      const rules = PLATFORM_RULES[normalizePlatform(p.platform)] || PLATFORM_RULES.facebook;
      if (!rules.allowsPayPalLink) return false;
      return !p.content || !p.content.includes("paypal.com/donate");
    });

    let fixed = 0;
    for (const post of missingLinks) {
      const campaignTitle = post.campaignTitle || "Interplanetary Fund";
      const link = generatePayPalLink(campaignTitle);
      const ifUrl = generateIFCampaignUrl(post.campaignId);
      const donationBlock = `\n\n💝 Donate now: ${ifUrl}\nPayPal: ${link}\nThank you! 🙏`;

      await ctx.db.patch(post._id, {
        content: (post.content || "") + donationBlock,
        ifCampaignUrl: ifUrl,
      });
      fixed++;
    }

    return { status: "success", postsChecked: posts.length, postsFixed: fixed };
  },
});

// =====================================================
// AUTO-PUBLISHING PIPELINE — wired into crons.ts
// =====================================================
// Daily auto-generation of post content for all active campaigns.
// Creates campaign_listing posts for crowdfunding platforms and outreach
// posts for social platforms. Tracks organizer accounts and platform lifecycle.

export const autoGeneratePosts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const campaigns = await ctx.db.query("monitoredCampaigns")
      .withIndex("byStatus", (q) => q.eq("status", "active"))
      .collect();

    const activeCampaigns = campaigns.filter(c => c.outreachEnabled === true);
    const results = [];
    const connectedPlatforms = await ctx.db.query("externalPlatforms").collect();
    const knownAccounts = await ctx.db.query("accountsCreated").collect();
    const knownOrganizerKeys = new Set(
      knownAccounts.map((a) => `${normalizePlatform(String(a.platform || ""))}::${String(a.accountEmail || "").toLowerCase()}`)
    );
    const organizerPlatforms = ["gofundme", "kickstarter", "indiegogo", "givesendgo", "fundrazr"];

    for (const campaign of activeCampaigns) {
      // Determine target platforms from existing connections or fall back to full set
      const platforms = connectedPlatforms
        .filter((p) => p.campaignId === campaign.ifCampaignId)
        .map((p) => String(p.platform || ""))
        .filter((p) => p.length > 0);
      const targetPlatforms: string[] = platforms.length > 0
        ? Array.from(new Set(platforms))
        : ["facebook", "bluesky", "gofundme", "kickstarter", "indiegogo", "givesendgo", "fundrazr", "spotfund", "buymeacoffee", "patreon", "kofi"];

      for (const platform of targetPlatforms) {
        const listing = buildPlatformListing({
          campaignId: campaign.ifCampaignId,
          campaignTitle: campaign.title,
          campaignSummary: campaign.summary,
          platform,
        });

        // Check if we already have a pending post for this campaign+platform today
        const existing = await ctx.db.query("distributedPosts")
          .withIndex("byCampaignId", (q) => q.eq("campaignId", campaign.ifCampaignId))
          .collect();

        const today = new Date().toISOString().split("T")[0];
        const alreadyPostedToday = existing.some(p =>
          p.platform === platform &&
          p.createdAt?.startsWith(today) &&
          (p.status === "pending" || p.status === "posted")
        );

        if (!alreadyPostedToday) {
          const postId = await ctx.db.insert("distributedPosts", {
            campaignId: campaign.ifCampaignId,
            campaignTitle: campaign.title,
            platform,
            postType: "campaign_listing",
            content: listing.description,
            paypalLink: listing.paypalLink,
            ifCampaignUrl: listing.ifCampaignUrl,
            listingType: "campaign_listing",
            status: "pending",
            createdAt: new Date().toISOString(),
          });
          results.push({
            campaign: campaign.title,
            platform,
            postId,
            listingTitle: listing.listingTitle,
            category: listing.requirements.category,
          });
        }

        // Create or update externalPlatforms row with listing lifecycle state
        const existingConnection = connectedPlatforms.find(
          (p) => p.campaignId === campaign.ifCampaignId && normalizePlatform(p.platform) === listing.normalizedPlatform
        );
        if (existingConnection) {
          await ctx.db.patch(existingConnection._id, {
            status: "listing_pending_publish",
            automationMode: listing.requirements.automationMode,
            displayName: listing.listingTitle,
            lastSynced: new Date().toISOString(),
          });
        } else {
          await ctx.db.insert("externalPlatforms", {
            platform: listing.normalizedPlatform,
            kind: "crowdfunding",
            displayName: listing.listingTitle,
            campaignId: campaign.ifCampaignId,
            externalTotal: 0,
            externalDonorCount: 0,
            status: "listing_pending_publish",
            automationMode: listing.requirements.automationMode,
            externalUrl: "",
            lastSynced: new Date().toISOString(),
            lastError: "",
          });
        }
      }

      // Ensure organizer account records exist for each crowdfunding platform
      for (const platform of organizerPlatforms) {
        const accountKey = `${platform}::${ORGANIZER_EMAIL.toLowerCase()}`;
        if (!knownOrganizerKeys.has(accountKey)) {
          await ctx.db.insert("accountsCreated", {
            platform,
            accountEmail: ORGANIZER_EMAIL,
            accountName: "Interplanetary Fund Organizer",
            purpose: "Organizer account for campaign listings",
            campaignId: campaign.ifCampaignId,
            credentialsStored: true,
            createdAt: new Date().toISOString(),
            reported: false,
          });
          knownOrganizerKeys.add(accountKey);
        }
      }
    }

    return {
      status: "success",
      campaignsProcessed: activeCampaigns.length,
      postsGenerated: results.length,
      results,
    };
  },
});

// Auto-publish pipeline: push approved posts to their platforms
// Platforms with API access are published; manual platforms are reclassified
export const autoPublishApprovedPosts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const manualPlatforms = [
      "gofundme", "kickstarter", "indiegogo", "givesendgo", "fundrazr", "spotfund",
    ];
    const apiPlatforms = ["facebook", "bluesky", "buymeacoffee"];

    const posts = await ctx.db.query("distributedPosts")
      .withIndex("byStatus", (q) => q.eq("status", "approved"))
      .collect();

    let reclassified = 0;
    let queued = 0;

    for (const post of posts) {
      const platKey = post.platform?.toLowerCase() || "";
      if (manualPlatforms.some(mp => platKey.includes(mp))) {
        await ctx.db.patch(post._id, { status: "manual_pending" });
        reclassified++;
      } else if (apiPlatforms.some(ap => platKey.includes(ap))) {
        // Mark as queued for API publish — actual API call happens in platform-specific functions
        await ctx.db.patch(post._id, { status: "publish_queued" });
        queued++;
      }
    }

    return {
      status: "success",
      postsProcessed: posts.length,
      reclassifiedToManual: reclassified,
      queuedForApi: queued,
    };
  },
});

// Query to get all pending posts ready for publishing
export const getPublishablePosts = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db.query("distributedPosts")
      .withIndex("byStatus", (q) => q.eq("status", "pending"))
      .collect();
    return pending;
  },
});

// Query to get all manual_pending posts for the manual queue UI
export const getManualPendingPosts = query({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db.query("distributedPosts").collect();
    return posts
      .filter((p) => p.status === "manual_pending")
      .map((p) => ({
        id: p._id,
        campaignTitle: p.campaignTitle,
        platform: p.platform,
        content: p.content,
        ifCampaignUrl: p.ifCampaignUrl,
        listingType: p.listingType,
        createdAt: p.createdAt,
      }));
  },
});

// Mutation to mark a post as posted
export const markPostPublished = mutation({
  args: {
    postId: v.string(),
    campaignId: v.optional(v.string()),
    platform: v.optional(v.string()),
    postUrl: v.optional(v.string()),
    reactions: v.optional(v.number()),
    comments: v.optional(v.number()),
    shares: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId as any, {
      status: "posted",
      postUrl: args.postUrl,
      postedAt: new Date().toISOString(),
      reactions: args.reactions || 0,
      comments: args.comments || 0,
      shares: args.shares || 0,
    });

    // Propagate published state to the matching externalPlatforms row
    if (args.campaignId && args.platform) {
      const normalizedPlatform = normalizePlatform(args.platform);
      const connection = await ctx.db
        .query("externalPlatforms")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", args.campaignId))
        .collect();
      const matchingConnection = connection.find(
        (p) => normalizePlatform(p.platform) === normalizedPlatform
      );
      if (matchingConnection) {
        await ctx.db.patch(matchingConnection._id, {
          status: "listing_posted",
          externalUrl: args.postUrl || matchingConnection.externalUrl,
          lastSynced: new Date().toISOString(),
        });
      }
    }

    return { status: "success" };
  },
});

// Mutation to mark a post as failed
export const markPostFailed = mutation({
  args: { postId: v.string(), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId as any, {
      status: "failed",
      error: args.error,
      postedAt: new Date().toISOString(),
    });
    return { status: "success" };
  },
});
