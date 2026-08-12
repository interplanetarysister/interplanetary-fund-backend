/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { internalMutation } from "./_generated/server";

// Internal cron-callable version of cleanupPlaceholderUrls (issue #7)
// Runs weekly via crons.ts to keep platform data clean
export const cleanupPlaceholderUrlsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const platforms = await ctx.db.query("externalPlatforms").collect();

    // Placeholder values or URLs shorter than a real URL (< 10 chars)
    const placeholderUrls = new Set(["F", "H", "D", "Jjj", ""]);
    // Single-character or known placeholder display names from legacy import
    const placeholderDisplayNames = new Set(["F", "H", "T", "Y", "D", "Jjj"]);
    const cleaned = [];

    for (const platform of platforms) {
      const url = platform.externalUrl || "";
      const displayName = platform.displayName || "";
      const hasPlaceholderUrl = placeholderUrls.has(url) || url.length < 10;
      const hasPlaceholderName = placeholderDisplayNames.has(displayName);

      if (hasPlaceholderUrl || hasPlaceholderName) {
        const updates: Record<string, string> = {
          status: "draft",
          lastError: "Placeholder data cleaned by automated weekly job",
          lastSynced: new Date().toISOString(),
        };
        if (hasPlaceholderUrl) updates.externalUrl = "";
        if (hasPlaceholderName) {
          updates.displayName = `Interplanetary Fund – ${platform.platform} (pending)`;
        }
        await ctx.db.patch(platform._id, updates);
        cleaned.push({
          id: platform._id,
          platform: platform.platform,
          oldDisplayName: displayName,
          oldUrl: url,
          changes: Object.keys(updates).filter(k => !["status", "lastError", "lastSynced"].includes(k)),
        });
      }
    }

    return {
      status: "success",
      platformsChecked: platforms.length,
      platformsCleaned: cleaned.length,
      cleanedAt: new Date().toISOString(),
      details: cleaned,
    };
  },
});
