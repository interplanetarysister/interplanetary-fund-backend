const DEFAULT_CONVEX_URL = "https://rosy-butterfly-2.convex.cloud";

const normalizeConvexUrl = (value: string) => value.replace(/\/+$/, "");

export const getConvexUrl = (value?: string) => normalizeConvexUrl(value || DEFAULT_CONVEX_URL);

export const injectConvexPreconnect = (convexUrl: string) => {
  if (typeof document === "undefined") return;

  const origin = new URL(convexUrl).origin;
  const ensureLink = (rel: "preconnect" | "dns-prefetch") => {
    const selector = `link[rel="${rel}"][href="${origin}"]`;
    if (document.head.querySelector(selector)) return;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = origin;
    if (rel === "preconnect") link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  };

  ensureLink("preconnect");
  ensureLink("dns-prefetch");
};
