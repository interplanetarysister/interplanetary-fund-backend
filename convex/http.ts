/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { httpRouter } from "convex/server";
import {
  paypalWebhook,
  kofiWebhook,
  bmacWebhook,
  patreonWebhook,
} from "./webhooks";

// =====================================================
// HTTP ROUTER — Webhook Endpoint Wiring
//
// Convex exposes HTTP Actions at:
//   https://rosy-butterfly-2.convex.site/<path>
//
// Register each URL below in the corresponding platform dashboard:
//   PayPal IPN:        https://rosy-butterfly-2.convex.site/webhooks/paypal
//   Ko-fi:             https://rosy-butterfly-2.convex.site/webhooks/kofi
//   Buy Me a Coffee:   https://rosy-butterfly-2.convex.site/webhooks/buymeacoffee
//   Patreon:           https://rosy-butterfly-2.convex.site/webhooks/patreon
// =====================================================

const http = httpRouter();

http.route({
  path: "/webhooks/paypal",
  method: "POST",
  handler: paypalWebhook,
});

http.route({
  path: "/webhooks/kofi",
  method: "POST",
  handler: kofiWebhook,
});

http.route({
  path: "/webhooks/buymeacoffee",
  method: "POST",
  handler: bmacWebhook,
});

http.route({
  path: "/webhooks/patreon",
  method: "POST",
  handler: patreonWebhook,
});

export default http;
