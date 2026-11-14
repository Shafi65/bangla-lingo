import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests. Run from web/ (content.ts resolves ../content from process.cwd()).
// Component/DOM-dependent files opt in with `// @vitest-environment jsdom`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside a Next server build; stub it for tests.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
