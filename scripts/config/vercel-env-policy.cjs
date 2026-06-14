const {
  isPrivateAutomationHostname,
} = require("../lib/private-automation-url.cjs");

const FORBIDDEN_OPENAI_PREFIX = "NEXT_PUBLIC_OPENAI";

const FORBIDDEN_VERCEL_ENV_NAMES = new Set([
  "AUTOMATION_SERVICE_URL",
  "OPENAI_API_KEY",
  "REDIS_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

const FORBIDDEN_VERCEL_ENV_PREFIXES = ["KICK_", "TIKTOK_", "YOUTUBE_"];

const REQUIRED_VERCEL_ENV_NAMES = [
  "APP_ENV",
  "APP_ENCRYPTION_KEY",
  "API_GATEWAY_SECRET",
  "API_GATEWAY_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STREAMOS_DEMO_MODE",
  "STREAM_EVENT_WEBHOOK_SECRET",
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
  "TWITCH_REDIRECT_URI",
  "TWITCH_SCOPES",
];

const PUBLIC_URL_VERCEL_ENV_NAMES = new Set([
  "API_GATEWAY_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "TWITCH_REDIRECT_URI",
]);

function normalizeEnvValue(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function findForbiddenOpenAIEnvNames(env = {}) {
  return Object.keys(env)
    .filter((name) => name.startsWith(FORBIDDEN_OPENAI_PREFIX))
    .sort((left, right) => left.localeCompare(right));
}

function formatForbiddenOpenAIEnvError(names, contextLabel = "web app") {
  return `${names.join(", ")} must not be configured in the ${contextLabel}. OpenAI keys are server-only and belong in services/automation-service as OPENAI_API_KEY.`;
}

function isSet(env, name) {
  return normalizeEnvValue(env?.[name]) !== "";
}

function validatePublicUrl(name, rawValue) {
  let parsedUrl;

  try {
    parsedUrl = new URL(rawValue);
  } catch {
    return {
      name,
      reason: `${name} must be a valid absolute URL.`,
    };
  }

  if (
    isPrivateAutomationHostname(parsedUrl.hostname, {
      expectedServiceName: "automation-service",
    })
  ) {
    return {
      name,
      reason: `${name} must not use localhost, private IPs, or railway.internal.`,
    };
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      name,
      reason: `${name} must use https.`,
    };
  }

  if (
    name === "TWITCH_REDIRECT_URI" &&
    parsedUrl.pathname !== "/api/auth/twitch/callback"
  ) {
    return {
      name,
      reason: `${name} must point to /api/auth/twitch/callback.`,
    };
  }

  return null;
}

function collectVercelEnvironmentIssues(
  env = {},
  { requireRequired = false, validatePublicUrls = false } = {},
) {
  const issues = [];

  if (requireRequired) {
    for (const name of REQUIRED_VERCEL_ENV_NAMES) {
      if (!isSet(env, name)) {
        issues.push({
          name,
          reason: `${name} is required in the Vercel environment.`,
        });
      }
    }
  }

  for (const name of Object.keys(env).sort((left, right) =>
    left.localeCompare(right),
  )) {
    if (name.startsWith(FORBIDDEN_OPENAI_PREFIX)) {
      issues.push({
        name,
        reason: `${name} must not be configured in the Vercel environment.`,
      });
      continue;
    }

    if (FORBIDDEN_VERCEL_ENV_NAMES.has(name)) {
      issues.push({
        name,
        reason: `${name} must not be configured in the Vercel environment.`,
      });
      continue;
    }

    if (
      FORBIDDEN_VERCEL_ENV_PREFIXES.some((prefix) => name.startsWith(prefix))
    ) {
      issues.push({
        name,
        reason: `${name} must not be configured in the Vercel environment.`,
      });
      continue;
    }

    if (validatePublicUrls && PUBLIC_URL_VERCEL_ENV_NAMES.has(name)) {
      const value = normalizeEnvValue(env[name]);

      if (!value) {
        continue;
      }

      const issue = validatePublicUrl(name, value);

      if (issue) {
        issues.push(issue);
      }
    }
  }

  return issues;
}

function formatVercelEnvironmentIssues(
  issues,
  contextLabel = "Vercel environment",
) {
  if (issues.length === 0) {
    return "";
  }

  const uniqueIssues = Array.from(
    new Map(issues.map((issue) => [issue.name, issue])).values(),
  );

  return [
    `Invalid ${contextLabel}:`,
    ...uniqueIssues.map((issue) => `- ${issue.name}: ${issue.reason}`),
  ].join("\n");
}

function assertVercelEnvironment(
  env = {},
  {
    contextLabel = "Vercel environment",
    requireRequired = false,
    validatePublicUrls = false,
  } = {},
) {
  const issues = collectVercelEnvironmentIssues(env, {
    requireRequired,
    validatePublicUrls,
  });

  if (issues.length > 0) {
    throw new Error(formatVercelEnvironmentIssues(issues, contextLabel));
  }
}

module.exports = {
  FORBIDDEN_OPENAI_PREFIX,
  FORBIDDEN_VERCEL_ENV_NAMES,
  FORBIDDEN_VERCEL_ENV_PREFIXES,
  PUBLIC_URL_VERCEL_ENV_NAMES,
  REQUIRED_VERCEL_ENV_NAMES,
  assertVercelEnvironment,
  collectVercelEnvironmentIssues,
  findForbiddenOpenAIEnvNames,
  formatForbiddenOpenAIEnvError,
  formatVercelEnvironmentIssues,
  normalizeEnvValue,
  validatePublicUrl,
};
