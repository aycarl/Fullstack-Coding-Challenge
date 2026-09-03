import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Absolute, not "./src/test-setup.ts": a generated app is a Vite project
    // nested inside this one, and a relative setup path there resolves against
    // the outer project instead of its own.
    setupFiles: [resolve(__dirname, "src/test-setup.ts")],
    // Without this, Vitest's default glob sweeps the agent's generated output as
    // well. Those tests resolve "@/..." against their own src, not this one, so
    // running the suite here would fail on imports that are correct over there.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "agent/**",
      "generated-app/**",
    ],
  },
});
