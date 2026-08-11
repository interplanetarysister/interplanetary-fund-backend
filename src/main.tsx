/*
 * Interplanetary Fund — Copyright © 2026 Michelle Rogers. All Rights Reserved.
 * PROPRIETARY AND CONFIDENTIAL. Do not copy, distribute, or modify without
 * express written permission. See LICENSE file for full terms.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { logRuntimeError } from "./utils/runtimeLogger";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "https://placeholder.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

if (!import.meta.env.VITE_CONVEX_URL) {
  logRuntimeError("Missing VITE_CONVEX_URL", { type: "config" });
}

window.addEventListener("error", (event) => {
  logRuntimeError(event.error ?? event.message, {
    type: "window.error",
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  logRuntimeError(event.reason, { type: "window.unhandledrejection" });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
