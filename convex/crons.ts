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
// Generates empathetic posts with PayPal links for all active campaigns
// Posts are stored as "pending" in distributedPosts for agents to publish
crons.daily(
  "daily-post-generation",
  { hourUTC: 15, minuteUTC: 0 },
  internal.postContent.autoGeneratePosts,
  {}
);

// Daily external platform balance check + migration queue
crons.daily(
  "daily-platform-balance-check",
  { hourUTC: 16, minuteUTC: 0 },
  internal.fundMigration.checkBalancesAndQueueMigrations,
  {}
);

export default crons;
