import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "react-native": new URL("./test/react-native-stub.ts", import.meta.url).pathname,
      "react-native-url-polyfill/auto": new URL("./test/url-polyfill-auto-stub.ts", import.meta.url).pathname
    }
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/*.test.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 90
      }
    }
  }
});
