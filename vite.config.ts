import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  define: {
    "process.env.CONVEX_URL": JSON.stringify(process.env.VITE_CONVEX_URL),
  },
  // Modern build target — smaller output, faster parsing on Galaxy A16
  esbuild: {
    target: "es2020",
  },
  build: {
    // Disable source maps — prevents code recovery from production build
    sourcemap: false,
    // Aggressive minification with esbuild (bundled, no extra deps)
    minify: "esbuild",
    // Target modern browsers for smaller output
    target: "es2020",
    // CSS code splitting
    cssCodeSplit: true,
    // The globe route is intentionally lazy-loaded and ships a large visualization chunk.
    chunkSizeWarningLimit: 1500,
    esbuildOptions: {
      drop: ["console", "debugger"],
      minify: true,
      legalComments: "none",
    },
    rollupOptions: {
      output: {
        // Add copyright watermark in bundle
        banner: "/* Interplanetary Fund © 2026 Michelle Rogers. All Rights Reserved. PROPRIETARY. */",
        // Vite 8/Rolldown expects manualChunks as a function. Preserve the existing
        // React and Convex vendor boundaries without using the legacy object form.
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/convex")) {
            return "convex-vendor";
          }
          return undefined;
        },
      },
    },
  },
  // Dev server optimizations for local testing on Galaxy A16
  server: {
    host: true,
    port: 5173,
  },
});
