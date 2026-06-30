import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "coverage/**", "next-env.d.ts", "node_modules/**", "out/**"]
  }
];

export default config;
