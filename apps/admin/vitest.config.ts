import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 90
      }
    }
  }
});
