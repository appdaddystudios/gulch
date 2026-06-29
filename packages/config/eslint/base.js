import js from "@eslint/js";

export default [
  {
    ignores: ["dist/**", "node_modules/**", ".turbo/**", "coverage/**"]
  },
  js.configs.recommended
];
