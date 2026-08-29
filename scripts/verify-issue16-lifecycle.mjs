import { readFileSync } from "node:fs";

const lifecycle = readFileSync("convex/campaignLifecycleInternal.ts", "utf8");
const crons = readFileSync("convex/crons.ts", "utf8");
const campaigns = readFileSync("convex/campaigns.ts", "utf8");

const required = [
  ["internal-only mutation", /internalMutation\(\{/],
  ["terminal status mapping", /closed:\s*"campaign_closed"[\s\S]*finished:\s*"campaign_finished"[\s\S]*deleted:\s*"campaign_deleted"/],
  ["indexed campaign pagination", /withIndex\("byStatus"[\s\S]*\.paginate\(/],
  ["bounded campaign page", /CAMPAIGN_PAGE_SIZE\s*=\s*25/],
  ["bounded listing reads", /\.take\(LISTING_PAGE_SIZE\)/],
  ["bounded distributed post cleanup", /\.take\(POST_DELETE_BATCH_SIZE\)/],
  ["bounded facebook post cleanup", /facebookGroupPosts[\s\S]*\.take\(POST_DELETE_BATCH_SIZE\)/],
  ["24-hour lifecycle cron", /daily-campaign-lifecycle-sync[\s\S]*hourUTC: 17, minuteUTC: 23/],
  ["durable continuation", /ctx\.scheduler\.runAfter\(0, internal\.campaignLifecycleInternal\.syncCampaignLifecycle/],
  ["closed-to-finished chain", /status:\s*"finished"/],
  ["finished-to-deleted chain", /status:\s*"deleted"/],
  ["donation preservation", /paymentActive:\s*true/],
  ["30-day retention", /30 \* 24 \* 60 \* 60 \* 1000/],
  ["no unbounded campaign collect", !/monitoredCampaigns[\s\S]*\.collect\(/],
  ["no unbounded distributed-post collect", !/distributedPosts[\s\S]*\.collect\(/],
  ["no unbounded facebook-post collect", !/facebookGroupPosts[\s\S]*\.collect\(/],
  ["current sync keeps payment active", /outreachEnabled:\s*true,\s*paymentActive:\s*true/],
];

const failures = [];
for (const [label, rule] of required) {
  const pass = rule instanceof RegExp ? rule.test(rule === null ? "" : (label.includes("current sync") ? campaigns : lifecycle + "\n" + crons)) : rule;
  if (!pass) failures.push(label);
}

if (failures.length) {
  console.error("Issue #16 lifecycle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Issue #16 lifecycle verification passed.");
console.log("Verified: internal-only bounded pagination, explicit status mapping, durable cursor continuation, donation preservation, and 30-day bounded cleanup.");
