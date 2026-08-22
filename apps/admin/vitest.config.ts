import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror tsconfig "@/*" so tests can import app modules the way the app does.
    alias: { "@": appDir }
  },
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
