/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

export function normalizeOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const BUSINESS_EMAIL = "interplanetarysister@gmail.com";
export const PLATFORM_BASE_URL = "https://interplanetary-fund.vercel.app";

export function generatePayPalLink(campaignTitle: string): string {
  const params = new URLSearchParams({
    cmd: "_donations",
    business: BUSINESS_EMAIL,
    item_name: `${campaignTitle} - Interplanetary Fund`,
    currency_code: "USD",
  });
  return `https://www.paypal.com/donate/?${params.toString()}`;
}

export function generateCampaignPlatformLink(campaignId: string): string {
  return `${PLATFORM_BASE_URL}/?campaignId=${encodeURIComponent(campaignId)}`;
}
