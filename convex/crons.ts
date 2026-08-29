/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// =====================================================
// SCHEDULED JOBS (Credit-Free — runs as Convex cron)
// =====================================================
// All times in UTC. Pacific is UTC-7 (PDT) or UTC-8 (PST).
// 6am Pacific = 13:00 UTC (during PDT)
// Saturday 2am Pacific = 09:00 UTC Saturday (during PDT)
// 8am Pacific = 15:00 UTC (during PDT) — daily post generation
// Hourly sync = :00 every hour UTC

const crons = cronJobs();

// Daily Protocol Enforcement — 6am Pacific (13:00 UTC)
crons.daily(
  "daily-protocol-enforcement",
  { hourUTC: 13, minuteUTC: 0 },
  internal.protocol.weeklyTraining,
  {}
);

// Weekly Training — Saturday 2am Pacific (09:00 UTC Saturday)
crons.weekly(
  "weekly-training-session",
  { dayOfWeek: "saturday", hourUTC: 9, minuteUTC: 0 },
  internal.protocol.weeklyTraining,
  {}
);

// Daily Auto-Post Generation — 8am Pacific (15:00 UTC)
// Generates empathetic posts with PayPal + IF app links for all active campaigns
// Posts are stored as "pending" in distributedPosts for agents to publish
crons.daily(
  "daily-post-generation",
  { hourUTC: 15, minuteUTC: 0 },
  internal.postContent.autoGeneratePosts,
  {}
);

// Daily Auto-Publish Pipeline — 8:30am Pacific (15:30 UTC)
// Moves approved posts to manual_pending or publish_queued based on platform type
crons.daily(
  "daily-auto-publish-pipeline",
  { hourUTC: 15, minuteUTC: 30 },
  internal.postContent.autoPublishApprovedPosts,
  {}
);

// Daily Raised-Amount Sync — every morning 5am Pacific (12:00 UTC)
// Aggregates externalPlatforms.externalTotal → monitoredCampaigns.raisedAmount
crons.daily(
  "daily-raised-amount-sync",
  { hourUTC: 12, minuteUTC: 0 },
  internal.syncRaisedAmounts.syncAllCampaignTotalsInternal,
  {}
);

// Weekly External Balance Check — every Sunday 6am Pacific (13:00 UTC Sunday)
// Detects platforms with non-zero balances and flags for fund migration
crons.weekly(
  "weekly-balance-check",
  { dayOfWeek: "sunday", hourUTC: 13, minuteUTC: 0 },
  internal.syncRaisedAmounts.weeklyBalanceCheck,
  {}
);

// Weekly Platform Cleanup — every Monday 3am Pacific (10:00 UTC Monday)
// Sets placeholder/invalid platform URLs to "draft" status
crons.weekly(
  "weekly-platform-cleanup",
  { dayOfWeek: "monday", hourUTC: 10, minuteUTC: 0 },
  internal.cleanupPlatformsInternal.cleanupPlaceholderUrlsInternal,
  {}
);

// Daily Campaign Defaults Enforcement — 7am Pacific (14:00 UTC)
// Ensures all campaigns have outreachEnabled, paymentActive, cashapp_tag, etc.
crons.daily(
  "daily-campaign-defaults",
  { hourUTC: 14, minuteUTC: 0 },
  internal.campaignDefaultsInternal.enforceAllDefaults,
  {}
);

// Daily external platform balance check + migration queue — 9am Pacific (16:00 UTC)
// Scans externalPlatforms for positive balances and queues fund migrations
crons.daily(
  "daily-platform-balance-check",
  { hourUTC: 16, minuteUTC: 0 },
  internal.fundMigration.checkBalancesAndQueueMigrations,
  {}
);

// Daily campaign lifecycle propagation — 10am Pacific (17:00 UTC)
// Uses an off-peak minute and a bounded cursor chain to propagate terminal
// listing states within the required 24-hour window and perform 30-day cleanup.
crons.daily(
  "daily-campaign-lifecycle-sync",
  { hourUTC: 17, minuteUTC: 23 },
  internal.campaignLifecycleInternal.syncCampaignLifecycle,
  { status: "closed" }
);

export default crons;
