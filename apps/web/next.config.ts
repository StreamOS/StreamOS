import type { NextConfig } from "next";

const forbiddenClientSecretEnvNames = Object.keys(process.env).filter(
  (name) => name.startsWith("NEXT_PUBLIC_OPENAI") && Boolean(process.env[name]),
);

if (forbiddenClientSecretEnvNames.length > 0) {
  throw new Error(
    `${forbiddenClientSecretEnvNames.join(", ")} must not be configured in the web app. ` +
      "OpenAI keys are server-only and belong in services/automation-service as OPENAI_API_KEY.",
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
