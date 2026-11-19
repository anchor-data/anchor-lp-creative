import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// All routes are dynamic (authenticated, per-request), so no incremental cache is configured.
export default defineCloudflareConfig({});
