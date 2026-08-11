type RuntimeErrorContext = Record<string, unknown>;

export function logRuntimeError(error: unknown, context: RuntimeErrorContext = {}) {
  const endpoint = import.meta.env.VITE_LOG_ENDPOINT;
  if (!endpoint) return;

  const location = `${window.location.origin}${window.location.pathname}`;
  const payload = {
    timestamp: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    userAgent: navigator.userAgent,
    location,
  };

  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
      return;
    }
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never block UI on logging failures.
  }
}
