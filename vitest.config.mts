import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // .tsx so the report can be smoke-rendered for the scored / not-observed /
    // not-applicable states, which no single live URL can produce at once.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
