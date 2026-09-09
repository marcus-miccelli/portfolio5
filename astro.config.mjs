import { defineConfig } from "astro/config";

// Set SITE_URL when a real public domain is chosen. No invented canonical URL.
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  output: "static",
  trailingSlash: "always",
  devToolbar: { enabled: false },
});
