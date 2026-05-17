import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "tests/stubs/obsidian.ts"),
      // Force tests to load the TypeScript source, not a previously-built main.js
      "../main": resolve(__dirname, "main.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
