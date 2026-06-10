import type { NextConfig } from "next";

const forbiddenClientSecretEnvNames = [
  "NEXT_PUBLIC_OPENAI_KEY",
  "NEXT_PUBLIC_OPENAI_API_KEY",
] as const;

const supabaseBrowserUrlEnvName = "NEXT_PUBLIC_SUPABASE_URL";
const supabaseBrowserKeyEnvNames = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const configuredForbiddenEnvName = forbiddenClientSecretEnvNames.find(
  (name) => process.env[name],
);

if (configuredForbiddenEnvName) {
  throw new Error(
    `${configuredForbiddenEnvName} must not be configured in the web app. ` +
      "OpenAI keys are server-only and belong in services/automation-service as OPENAI_API_KEY.",
  );
}

const requiresSupabaseBrowserEnv =
  process.env.STREAMOS_REQUIRE_SUPABASE_ENV === "true" ||
  (process.env.VERCEL === "1" &&
    ["preview", "production"].includes(process.env.VERCEL_ENV ?? ""));

const missingSupabaseBrowserEnvNames = [
  ...(!process.env[supabaseBrowserUrlEnvName]?.trim()
    ? [supabaseBrowserUrlEnvName]
    : []),
  ...(supabaseBrowserKeyEnvNames.some((name) => process.env[name]?.trim())
    ? []
    : [supabaseBrowserKeyEnvNames.join(" or ")]),
];

if (
  requiresSupabaseBrowserEnv &&
  process.env.STREAMOS_DEMO_MODE !== "true" &&
  missingSupabaseBrowserEnvNames.length > 0
) {
  throw new Error(
    `Missing required browser Supabase environment variable(s): ${missingSupabaseBrowserEnvNames.join(
      ", ",
    )}. Add them to the Vercel project for the target environment before deploying.`,
  );
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
