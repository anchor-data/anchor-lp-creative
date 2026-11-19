import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Every page in this tool is per-user and per-request (Cloudflare Access auth),
// so Cache Components (which also requires the Node.js runtime) stays off for
// Cloudflare Workers compatibility.
const nextConfig: NextConfig = {
  cacheComponents: false,
  partialPrefetching: false,
  serverExternalPackages: ["@libsql/client"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Exposes Cloudflare bindings (R2, Workers AI) to `next dev`.
initOpenNextCloudflareForDev();
