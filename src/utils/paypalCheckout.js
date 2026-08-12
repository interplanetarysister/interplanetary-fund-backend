/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

export const DEFAULT_PAYPAL_BUSINESS_EMAIL = "interplanetarysister@gmail.com";

export function getPayPalClientConfig(env) {
  const sourceEnv = env || (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {});
  const clientId = (sourceEnv.VITE_PAYPAL_CLIENT_ID || "").trim();
  const merchantId = (sourceEnv.VITE_PAYPAL_MERCHANT_ID || "").trim();
  const currency = (sourceEnv.VITE_PAYPAL_CURRENCY || "USD").trim().toUpperCase() || "USD";
  const intent = sourceEnv.VITE_PAYPAL_INTENT === "authorize" ? "authorize" : "capture";
  const commit = sourceEnv.VITE_PAYPAL_COMMIT !== "false";

  return {
    clientId,
    merchantId,
    businessEmail: (sourceEnv.VITE_PAYPAL_BUSINESS_EMAIL || DEFAULT_PAYPAL_BUSINESS_EMAIL).trim() || DEFAULT_PAYPAL_BUSINESS_EMAIL,
    currency,
    intent,
    commit,
    sdkEnabled: Boolean(clientId),
  };
}

export function buildPayPalSdkUrl(config = getPayPalClientConfig()) {
  if (!config.clientId) return null;

  const sdkUrl = new URL("https://www.paypal.com/sdk/js");
  sdkUrl.searchParams.set("client-id", config.clientId);
  sdkUrl.searchParams.set("currency", config.currency || "USD");
  sdkUrl.searchParams.set("intent", config.intent || "capture");
  sdkUrl.searchParams.set("commit", String(config.commit !== false));
  sdkUrl.searchParams.set("components", "buttons,funding-eligibility");
  sdkUrl.searchParams.set("enable-funding", "card");
  if (config.merchantId) {
    sdkUrl.searchParams.set("merchant-id", config.merchantId);
  }

  return sdkUrl.toString();
}

export async function loadPayPalSdk(config = getPayPalClientConfig()) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("PayPal SDK can only load in a browser.");
  }

  if (window.paypal?.Buttons) {
    return window.paypal;
  }

  const sdkUrl = buildPayPalSdkUrl(config);
  if (!sdkUrl) {
    throw new Error("PayPal client ID is not configured.");
  }

  const existing = document.querySelector('script[data-paypal-sdk="true"]');
  if (existing) {
    await waitForPayPalSdk(existing);
    return window.paypal;
  }

  const script = document.createElement("script");
  script.src = sdkUrl;
  script.async = true;
  script.dataset.paypalSdk = "true";
  document.head.appendChild(script);
  await waitForPayPalSdk(script);
  return window.paypal;
}

function waitForPayPalSdk(script) {
  return new Promise((resolve, reject) => {
    if (window.paypal?.Buttons) {
      resolve(window.paypal);
      return;
    }

    const handleLoad = () => {
      cleanup();
      if (window.paypal?.Buttons) {
        resolve(window.paypal);
        return;
      }
      reject(new Error("PayPal SDK loaded without Buttons support."));
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Unable to load the PayPal SDK."));
    };

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
  });
}
