/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

export const REQUIRED_CONVEX_URL = "https://rosy-butterfly-2.convex.cloud";

const configuredConvexUrl = import.meta.env.VITE_CONVEX_URL;

export const convexUrl =
  configuredConvexUrl === REQUIRED_CONVEX_URL
    ? configuredConvexUrl
    : REQUIRED_CONVEX_URL;
