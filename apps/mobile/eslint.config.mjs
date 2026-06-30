import baseConfig from "@gulch/config/eslint";

export default [
  ...baseConfig,
  {
    files: ["babel.config.js", "metro.config.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        module: "readonly",
        require: "readonly"
      }
    }
  }
];
