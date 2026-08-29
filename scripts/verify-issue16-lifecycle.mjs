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

requireText("internal-only mutation", lifecycle, /internalMutation\(\{/);
requireText(
  "terminal status mapping",
  lifecycle,
  /closed:\s*"campaign_closed"[\s\S]*finished:\s*"campaign_finished"[\s\S]*deleted:\s*"campaign_deleted"/,
);
requireText("indexed campaign pagination", lifecycle, /withIndex\("byStatus"[\s\S]*\.paginate\(/);
requireText("bounded campaign page", lifecycle, /CAMPAIGN_PAGE_SIZE\s*=\s*1/);
requireText("bounded listing reads", lifecycle, /\.paginate\(\{[\s\S]*numItems:\s*LISTING_PAGE_SIZE/);
requireText("listing cursor continuation", lifecycle, /listingCursor:\s*listingsPage\.continueCursor/);
requireText("bounded distributed post cleanup", lifecycle, /distributedPosts[\s\S]*\.paginate\(\{[\s\S]*numItems:\s*POST_DELETE_BATCH_SIZE/);
requireText("distributed post cursor continuation", lifecycle, /distributedPostCursor:\s*distributedPostsPage\.continueCursor/);
requireText("bounded facebook post cleanup", lifecycle, /facebookGroupPosts[\s\S]*\.paginate\(\{[\s\S]*numItems:\s*POST_DELETE_BATCH_SIZE/);
requireText("facebook post cursor continuation", lifecycle, /facebookPostCursor:\s*facebookPostsPage\.continueCursor/);
requireText("durable continuation", lifecycle, /ctx\.scheduler\.runAfter\(0, internal\.campaignLifecycleInternal\.syncCampaignLifecycle/);
requireText("closed-to-finished chain", lifecycle, /args\.status\s*===\s*"closed"[\s\S]*status:\s*"finished"/);
requireText("finished-to-deleted chain", lifecycle, /args\.status\s*===\s*"finished"[\s\S]*status:\s*"deleted"/);
requireText("donation preservation", lifecycle, /paymentActive:\s*true/);
requireAbsent("retention timestamp mutation", lifecycle, /paymentActive:\s*true,[\s\S]*lastSynced:\s*nowIso/);
requireText("30-day retention", lifecycle, /30 \* 24 \* 60 \* 60 \* 1000/);
requireText("off-peak lifecycle cron", crons, /daily-campaign-lifecycle-sync[\s\S]*hourUTC: 17, minuteUTC: 23/);
requireText("lifecycle cron starts closed phase", crons, /daily-campaign-lifecycle-sync[\s\S]*status:\s*"closed"/);
requireText("current campaign sync keeps payment active", campaigns, /outreachEnabled:\s*true,\s*paymentActive:\s*true/);
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
console.log("Verified: internal-only bounded pagination, explicit terminal mapping, durable cursor continuation, donation preservation, off-peak scheduling, and bounded 30-day cleanup.");
