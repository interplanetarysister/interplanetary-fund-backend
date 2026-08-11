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
    const placeholders = new Set(["F", "H", "D", "Jjj", ""]);
    const cleaned = [];

    for (const platform of platforms) {
      const url = platform.externalUrl || "";
      if (placeholders.has(url) || url.length < 10) {
        await ctx.db.patch(platform._id, {
          externalUrl: "",
          status: "draft",
          lastError: "Placeholder URL cleaned by automated weekly job",
          lastSynced: new Date().toISOString(),
        });
        cleaned.push({
          id: platform._id,
          platform: platform.platform,
          displayName: platform.displayName,
          oldUrl: url,
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
