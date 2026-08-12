import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PAYPAL_BUSINESS_EMAIL,
  buildPayPalSdkUrl,
  getPayPalClientConfig,
} from "./paypalCheckout.js";

test("getPayPalClientConfig falls back to the IF business account", () => {
  const config = getPayPalClientConfig({});

  assert.equal(config.businessEmail, DEFAULT_PAYPAL_BUSINESS_EMAIL);
  assert.equal(config.currency, "USD");
  assert.equal(config.intent, "capture");
  assert.equal(config.commit, true);
  assert.equal(config.sdkEnabled, false);
});

test("buildPayPalSdkUrl includes card funding and optional merchant id", () => {
  const config = getPayPalClientConfig({
    VITE_PAYPAL_CLIENT_ID: "sandbox-client",
    VITE_PAYPAL_MERCHANT_ID: "IFMERCHANT123",
    VITE_PAYPAL_CURRENCY: "usd",
    VITE_PAYPAL_COMMIT: "false",
  });

  const sdkUrl = new URL(buildPayPalSdkUrl(config));

  assert.equal(sdkUrl.origin, "https://www.paypal.com");
  assert.equal(sdkUrl.pathname, "/sdk/js");
  assert.equal(sdkUrl.searchParams.get("client-id"), "sandbox-client");
  assert.equal(sdkUrl.searchParams.get("merchant-id"), "IFMERCHANT123");
  assert.equal(sdkUrl.searchParams.get("currency"), "USD");
  assert.equal(sdkUrl.searchParams.get("commit"), "false");
  assert.equal(sdkUrl.searchParams.get("components"), "buttons,funding-eligibility");
  assert.equal(sdkUrl.searchParams.get("enable-funding"), "card");
});
