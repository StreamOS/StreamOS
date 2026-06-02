import type { NextConfig } from "next";

const forbiddenClientSecretEnvNames = [
  "NEXT_PUBLIC_OPENAI_KEY",
  "NEXT_PUBLIC_OPENAI_API_KEY"
] as const;

const configuredForbiddenEnvName = forbiddenClientSecretEnvNames.find(
  (name) => process.env[name]
);

if (configuredForbiddenEnvName) {
  throw new Error(
    `${configuredForbiddenEnvName} must not be configured in the web app. ` +
      "OpenAI keys are server-only and belong in services/automation-service as OPENAI_API_KEY."
  );
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "static-cdn.jtvnw.net" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
      { protocol: "https", hostname: "*.supabase.co" }
    ]
  },
  transpilePackages: ["@streamos/database", "@streamos/ui", "@streamos/types"]
};

export default nextConfig;
