import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config.
 *
 * Mirrors the `@/*` → repo-root alias defined in tsconfig.json's
 * `paths` field. Without this alias, any source file that imports via
 * `@/...` can only be tested if every `@/`-prefixed module in the
 * import chain is stubbed via `vi.mock`. With it, plain `await import`
 * works, and tests can use real modules wherever mocking adds no value.
 *
 * This matches the alias Next.js applies at build time, so production
 * and test resolution stay in lock-step.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
