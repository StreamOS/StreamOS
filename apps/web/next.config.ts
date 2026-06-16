import type { NextConfig } from "next";

import {
  assertNoForbiddenVercelEnv,
  assertVercelEnvironment,
  collectUnexpectedVercelEnvNames,
  formatUnexpectedVercelEnvWarning,
} from "../../scripts/config/vercel-env-policy.cjs";

assertNoForbiddenVercelEnv(process.env, {
  contextLabel: "apps/web Vercel build",
});

const unexpectedVercelEnvNames = collectUnexpectedVercelEnvNames(process.env);

if (unexpectedVercelEnvNames.length > 0) {
  console.warn(
    formatUnexpectedVercelEnvWarning(
      unexpectedVercelEnvNames,
      "apps/web Vercel build",
    ),
  );
}

const isVercelRuntime = process.env.VERCEL === "1";

if (isVercelRuntime) {
  assertVercelEnvironment(process.env, {
    contextLabel: "apps/web Vercel build",
    requireRequired: true,
    validatePublicUrls: true,
  });
}

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "static-cdn.jtvnw.net" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  transpilePackages: ["@streamos/database", "@streamos/ui", "@streamos/types"],
};

export default nextConfig;
