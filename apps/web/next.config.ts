import type { NextConfig } from "next";

import {
  assertVercelEnvironment,
  findForbiddenOpenAIEnvNames,
  formatForbiddenOpenAIEnvError,
} from "../../scripts/config/vercel-env-policy.cjs";

const forbiddenClientSecretEnvNames = findForbiddenOpenAIEnvNames(process.env);

if (forbiddenClientSecretEnvNames.length > 0) {
  throw new Error(
    formatForbiddenOpenAIEnvError(
      forbiddenClientSecretEnvNames,
      "apps/web Vercel build",
    ),
  );
}

const isVercelRuntime =
  process.env.VERCEL === "1" && process.env.NODE_ENV === "production";

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
