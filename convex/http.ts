/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/paypal/ipn",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    const verifyUrl = process.env.PAYPAL_IPN_VERIFY_URL || "https://ipnpb.paypal.com/cgi-bin/webscr";

    const verifyResponse = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "InterplanetaryFund-IPN-Verify",
      },
      body: `cmd=_notify-validate&${rawBody}`,
    });

    const verifyText = (await verifyResponse.text()).trim();
    if (!verifyResponse.ok || verifyText !== "VERIFIED") {
      return new Response("invalid_ipn", { status: 400 });
    }

    const payload = new URLSearchParams(rawBody);
    const paymentStatus = (payload.get("payment_status") || "").trim().toLowerCase();
    if (paymentStatus !== "completed") {
      return new Response("ignored_non_completed", { status: 202 });
    }

    const paymentReference = (payload.get("custom") || "").trim();
    const providerTransactionId = (payload.get("txn_id") || "").trim();
    const currency = (payload.get("mc_currency") || "USD").trim().toUpperCase();
    const grossRaw = (payload.get("mc_gross") || "").trim();
    const amount = Number(grossRaw);
    const receiverEmail = (payload.get("receiver_email") || payload.get("business") || "").trim();
    const payerFirst = (payload.get("first_name") || "").trim();
    const payerLast = (payload.get("last_name") || "").trim();
    const payerName = `${payerFirst} ${payerLast}`.trim() || (payload.get("payer_email") || "").trim() || "Anonymous";

    if (!paymentReference || !providerTransactionId || !Number.isFinite(amount) || amount <= 0) {
      return new Response("invalid_payload", { status: 400 });
    }

    const result: any = await ctx.runMutation(internal.paymentRouter.recordPayPalPaymentSuccess, {
      paymentReference,
      providerTransactionId,
      amount,
      currency,
      donorName: payerName,
      receiverEmail: receiverEmail || undefined,
    });

    if (result?.status === "duplicate_transaction") {
      return new Response("duplicate_transaction", { status: 200 });
    }
    if (result?.status === "already_settled" || result?.status === "already_confirmed") {
      return new Response(result.status, { status: 200 });
    }

    return new Response("ok", { status: 200 });
  }),
});

export default http;
