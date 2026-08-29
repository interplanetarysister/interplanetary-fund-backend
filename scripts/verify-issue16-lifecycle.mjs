import { readFileSync } from "node:fs";

const lifecycle = readFileSync("convex/campaignLifecycleInternal.ts", "utf8");
const crons = readFileSync("convex/crons.ts", "utf8");
const campaigns = readFileSync("convex/campaigns.ts", "utf8");

const failures = [];

function requireText(label, source, pattern) {
  if (!pattern.test(source)) failures.push(label);
}

function requireAbsent(label, source, pattern) {
  if (pattern.test(source)) failures.push(label);
}

function extractBlock(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  if (start < 0) return "";
  const remainder = source.slice(start);
  const end = remainder.search(endPattern);
  return end < 0 ? remainder : remainder.slice(0, end);
}

requireText("internal-only mutation", lifecycle, /export const syncCampaignLifecycle\s*=\s*internalMutation\(\{/);
requireText(
  "terminal status mapping",
  lifecycle,
  /const TERMINAL_STATUSES = \{[\s\S]*closed:\s*"campaign_closed"[\s\S]*finished:\s*"campaign_finished"[\s\S]*deleted:\s*"campaign_deleted"[\s\S]*\} as const;/,
);
requireText(
  "indexed campaign pagination",
  lifecycle,
  /ctx\.db\s*\.query\("monitoredCampaigns"\)[\s\S]*\.withIndex\("byStatus"[\s\S]*\.paginate\(\{/,
);
requireText("bounded campaign page", lifecycle, /const CAMPAIGN_PAGE_SIZE\s*=\s*1;/);
requireText(
  "bounded listing reads",
  lifecycle,
  /\.query\("externalPlatforms"\)[\s\S]*\.paginate\(\{[\s\S]*numItems:\s*LISTING_PAGE_SIZE/,
);
requireText("listing cursor continuation", lifecycle, /listingCursor:\s*listingsPage\.continueCursor/);
requireText(
  "bounded distributed post cleanup",
  lifecycle,
  /\.query\("distributedPosts"\)[\s\S]*\.paginate\(\{[\s\S]*numItems:\s*POST_DELETE_BATCH_SIZE/,
);
requireText("distributed post cursor continuation", lifecycle, /distributedPostCursor:\s*distributedPostsPage\.continueCursor/);
requireText(
  "bounded facebook post cleanup",
  lifecycle,
  /\.query\("facebookGroupPosts"\)[\s\S]*\.paginate\(\{[\s\S]*numItems:\s*POST_DELETE_BATCH_SIZE/,
);
requireText("facebook post cursor continuation", lifecycle, /facebookPostCursor:\s*facebookPostsPage\.continueCursor/);
requireText(
  "durable continuation",
  lifecycle,
  /ctx\.scheduler\.runAfter\(0, internal\.campaignLifecycleInternal\.syncCampaignLifecycle/,
);
requireText(
  "closed-to-finished chain",
  lifecycle,
  /if \(args\.status === "closed"\) \{[\s\S]*status:\s*"finished"[\s\S]*\}/,
);
requireText(
  "finished-to-deleted chain",
  lifecycle,
  /if \(args\.status === "finished"\) \{[\s\S]*status:\s*"deleted"[\s\S]*\}/,
);

const paymentRepairBlock = extractBlock(
  lifecycle,
  /if \(!campaign\.paymentActive\)/,
  /const listingsPage =/,
);
requireText("donation preservation", paymentRepairBlock, /paymentActive:\s*true/);
requireAbsent("retention timestamp mutation", paymentRepairBlock, /lastSynced\s*:/);
requireText("30-day retention", lifecycle, /const RETENTION_MS\s*=\s*30 \* 24 \* 60 \* 60 \* 1000;/);
requireText("off-peak lifecycle cron", crons, /daily-campaign-lifecycle-sync[\s\S]*hourUTC:\s*17,\s*minuteUTC:\s*23/);
requireText("lifecycle cron starts closed phase", crons, /daily-campaign-lifecycle-sync[\s\S]*status:\s*"closed"/);
requireText(
  "current campaign sync keeps payment active",
  campaigns,
  /const enforced = \{[\s\S]*outreachEnabled:\s*true,\s*paymentActive:\s*true,/,
);
requireAbsent("unbounded campaign collect", lifecycle, /monitoredCampaigns[\s\S]*\.collect\(/);
requireAbsent("unbounded distributed-post collect", lifecycle, /distributedPosts[\s\S]*\.collect\(/);
requireAbsent("unbounded facebook-post collect", lifecycle, /facebookGroupPosts[\s\S]*\.collect\(/);
requireAbsent("public mutation", lifecycle, /export const syncCampaignLifecycle\s*=\s*mutation\(/);
requireAbsent("external network access", lifecycle, /\bfetch\s*\(/);

if (failures.length) {
  console.error("Issue #16 lifecycle verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Issue #16 lifecycle verification passed.");
console.log(
  "Verified: internal-only bounded pagination, explicit terminal mapping, durable cursor continuation, donation preservation, off-peak scheduling, and bounded 30-day cleanup.",
);
