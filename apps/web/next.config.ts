import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@nutrition-saas/ui"],
  // Coolify's web image does not copy eslint.config.mjs. Lint stays on `pnpm lint`.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    optimizePackageImports: ["@nutrition-saas/ui"],
  },
  async redirects() {
    return [
      { source: "/orgs", destination: "/practice", permanent: false },
      { source: "/orgs/:path*", destination: "/practice/:path*", permanent: false },
      { source: "/dietitian", destination: "/practice", permanent: false },
    ];
  },
};

export default nextConfig;
