/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const BUSINESS_EMAIL = "interplanetarysister@gmail.com";
const ORGANIZER_EMAIL = "cuddlemeplatonically@gmail.com";

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

function generatePayPalLink(campaignTitle: string): string {
  const params = new URLSearchParams({
    cmd: "_donations",
    business: BUSINESS_EMAIL,
    item_name: `${campaignTitle} - Interplanetary Fund`,
    currency_code: "USD",
  });
  return `https://www.paypal.com/donate/?${params.toString()}`;
}

function truncateTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function buildPlatformListing({
  campaignTitle,
  campaignSummary,
  platform,
  customMessage,
}: {
  campaignTitle: string;
  campaignSummary?: string;
  platform: string;
  customMessage?: string;
}) {
  const normalized = normalizePlatform(platform);
  const rules = PLATFORM_RULES[normalized] || PLATFORM_RULES.facebook;
  const paypalLink = generatePayPalLink(campaignTitle);
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
    rules.allowsPayPalLink ? `IF PayPal donate link: ${paypalLink}` : "IF PayPal donate link: Not included on this platform",
  ].join("\n");

  return {
    platform: platform,
    normalizedPlatform: normalized,
    listingTitle,
    description,
    paypalLink: rules.allowsPayPalLink ? paypalLink : undefined,
    hasPayPalLink: rules.allowsPayPalLink,
    requirements: {
      maxTitleLength: rules.maxTitleLength,
      imageRequirement: rules.imageRequirement,
      category: rules.defaultCategory,
      automationMode: rules.automationMode,
    },
  };
}

// Generate campaign post content with embedded PayPal link
export const generatePostContent = mutation({
  args: {
    campaignId: v.string(),
    campaignTitle: v.string(),
    platform: v.string(),
    customMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const listing = buildPlatformListing({
      campaignTitle: args.campaignTitle,
      platform: args.platform,
      customMessage: args.customMessage,
    });
    const fullContent = listing.description;

    // For Facebook, also return the link separately for the link attachment field
    const isFacebook = args.platform.toLowerCase().includes("facebook");
    
    return {
      content: fullContent,
      paypalLink: listing.paypalLink,
      linkAttachment: isFacebook ? listing.paypalLink : undefined,
      listingTitle: listing.listingTitle,
      platformRequirements: listing.requirements,
      platform: args.platform,
      campaignId: args.campaignId,
      characterCount: fullContent.length,
      hasPayPalLink: listing.hasPayPalLink,
    };
  },
});

// Check all existing DistributedPosts for missing PayPal links
export const auditPostLinks = query({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db.query("distributedPosts").collect();
    const platformsRequiringPayPal = posts.filter((p) => {
      const rules = PLATFORM_RULES[normalizePlatform(p.platform)] || PLATFORM_RULES.facebook;
      return rules.allowsPayPalLink;
    });
    const missingLinks = platformsRequiringPayPal.filter(
      (p) => !p.content || !p.content.includes("paypal.com/donate")
    );
    return {
      totalPosts: posts.length,
      postsWithPayPalLink: platformsRequiringPayPal.length - missingLinks.length,
      postsMissingLinks: missingLinks.map((p) => ({
        id: p._id,
        campaign: p.campaignTitle || p.campaignId,
        platform: p.platform,
        action: "needs_regen",
      })),
    };
  },
});

// Fix posts that are missing PayPal links by appending them
export const fixMissingPayPalLinks = mutation({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db.query("distributedPosts").collect();
    const missingLinks = posts.filter(
      (p) => {
        const rules = PLATFORM_RULES[normalizePlatform(p.platform)] || PLATFORM_RULES.facebook;
        if (!rules.allowsPayPalLink) return false;
        return !p.content || !p.content.includes("paypal.com/donate");
      }
    );
    
    let fixed = 0;
    for (const post of missingLinks) {
      const campaignTitle = post.campaignTitle || "Interplanetary Fund";
      const link = generatePayPalLink(campaignTitle);
      const donationBlock = `\n\n💝 Donate now (any amount): ${link}\nThank you! 🙏`;
      
      await ctx.db.patch(post._id, {
        content: (post.content || "") + donationBlock,
      });
      fixed++;
    }
    
    return {
      status: "success",
      postsChecked: posts.length,
      postsFixed: fixed,
    };
  },
});

// =====================================================
// AUTO-PUBLISHING PIPELINE — wired into crons.ts
// =====================================================
// Daily auto-generation of post content for all active campaigns.
// Generates empathetic posts with PayPal donate links and stores them as pending.


export const autoGeneratePosts = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all active campaigns with outreach enabled
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
      // Store as pending post in distributedPosts for each connected platform.
      const platforms = connectedPlatforms
        .filter((p) => p.campaignId === campaign.ifCampaignId)
        .map((p) => String(p.platform || ""))
        .filter((p) => p.length > 0);
      const targetPlatforms: string[] = platforms.length > 0
        ? Array.from(new Set(platforms))
        : ["facebook", "bluesky", "gofundme", "kickstarter", "indiegogo", "givesendgo", "fundrazr", "spotfund", "buymeacoffee", "patreon", "kofi"];
      
      for (const platform of targetPlatforms) {
        const listing = buildPlatformListing({
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

      for (const platform of organizerPlatforms) {
        const accountKey = `${platform}::${ORGANIZER_EMAIL.toLowerCase()}`;
        const accountExists = knownOrganizerKeys.has(accountKey);
        if (!accountExists) {
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

    if (args.campaignId && args.platform) {
      const normalizedPlatform = normalizePlatform(args.platform);
      const connection = await ctx.db
        .query("externalPlatforms")
        .withIndex("byCampaignId", (q) => q.eq("campaignId", args.campaignId))
        .collect();
      const matchingConnection = connection.find((p) => normalizePlatform(p.platform) === normalizedPlatform);
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
