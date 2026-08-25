/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { internalMutation } from "./_generated/server";

function isPlaceholderOrInvalidUrl(value: string | undefined): boolean {
  const url = (value ?? "").trim();
  if (!url) return true;

  const normalized = url.toLowerCase();
  const knownPlaceholders = new Set([
    "f", "h", "d", "jjj", "test", "testing", "example", "placeholder",
    "todo", "tbd", "n/a", "na", "none", "null", "undefined", "localhost",
  ]);

  if (knownPlaceholders.has(normalized)) return true;
  if (normalized.includes("placeholder") || normalized.includes("example.com")) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol !== "http:" && parsed.protocol !== "https:";
  } catch {
    return true;
  }
}

// Internal cron-callable cleanup. Invalid platform connections remain draft
// and cannot be treated as publishable external accounts.
export const cleanupPlaceholderUrlsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const platforms = await ctx.db.query("externalPlatforms").collect();
    const cleaned = [];

    for (const platform of platforms) {
      const url = platform.externalUrl?.trim() ?? "";
      if (isPlaceholderOrInvalidUrl(url)) {
        await ctx.db.patch(platform._id, {
          externalUrl: "",
          status: "draft",
          lastError: "Missing, placeholder, or invalid HTTP(S) platform URL",
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
