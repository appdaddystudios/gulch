import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: join(appDir, "../..")
  },
  experimental: {
    // Banner uploads accept files up to 5 MB; Next's default action body
    // limit is 1 MB and would reject them before saveBanner runs.
    serverActions: {
      bodySizeLimit: "6mb"
    }
  }
};

export default nextConfig;
