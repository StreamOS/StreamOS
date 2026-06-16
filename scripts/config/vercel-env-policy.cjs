const {
  isPrivateAutomationHostname,
} = require("../lib/private-automation-url.cjs");

const FORBIDDEN_OPENAI_PREFIX = "NEXT_PUBLIC_OPENAI";

const ALLOWED_VERCEL_ENV_NAMES = new Set([
  "APP_ENCRYPTION_KEY",
  "APP_ENV",
  "API_GATEWAY_SECRET",
  "API_GATEWAY_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STREAMOS_DEMO_MODE",
  "STREAM_EVENT_WEBHOOK_SECRET",
  "TWITCH_CLIENT_ID",
  // TODO: Remove this temporary exception once Twitch OAuth fully migrates to
  // the API Gateway and Vercel no longer needs the Twitch client secret.
  "TWITCH_CLIENT_SECRET",
  "TWITCH_REDIRECT_URI",
  "TWITCH_SCOPES",
]);

const ALLOWED_VERCEL_ENV_PREFIXES = ["NODE_", "VERCEL_", "npm_"];

const FORBIDDEN_VERCEL_ENV_NAMES = new Set([
  "AUTOMATION_SERVICE_URL",
  "REDIS_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

const FORBIDDEN_VERCEL_ENV_PREFIXES = [
  FORBIDDEN_OPENAI_PREFIX,
  "KICK_",
  "OPENAI_",
  "RAILWAY_",
  "REPLICATE_",
  "TIKTOK_",
  "YOUTUBE_",
];

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

function matchesAnyPrefix(name, prefixes) {
  return prefixes.some((prefix) => name.startsWith(prefix));
}

function isAllowedVercelEnvName(name) {
  return (
    ALLOWED_VERCEL_ENV_NAMES.has(name) ||
    matchesAnyPrefix(name, ALLOWED_VERCEL_ENV_PREFIXES)
  );
}

function isForbiddenVercelEnvName(name) {
  return (
    FORBIDDEN_VERCEL_ENV_NAMES.has(name) ||
    matchesAnyPrefix(name, FORBIDDEN_VERCEL_ENV_PREFIXES)
  );
}

function findForbiddenOpenAIEnvNames(env = {}) {
  return Object.keys(env)
    .filter((name) => name.startsWith(FORBIDDEN_OPENAI_PREFIX))
    .sort((left, right) => left.localeCompare(right));
}

function formatForbiddenOpenAIEnvError(names, contextLabel = "web app") {
  return `${names.join(", ")} must not be configured in the ${contextLabel}. OpenAI keys are server-only and belong in services/automation-service as OPENAI_API_KEY.`;
}

function findForbiddenVercelEnvNames(env = {}, knownPresentNames = undefined) {
  const presentNames = normalizeKnownPresentNames(knownPresentNames);

  return Array.from(new Set([...Object.keys(env), ...presentNames]))
    .filter((name) => isForbiddenVercelEnvName(name))
    .sort((left, right) => left.localeCompare(right));
}

function formatForbiddenVercelEnvError(
  names,
  contextLabel = "Vercel environment",
) {
  return [
    `Invalid ${contextLabel}:`,
    ...names.map(
      (name) =>
        `- ${name}: This secret must only be set on Railway, not on Vercel.`,
    ),
  ].join("\n");
}

function collectUnexpectedVercelEnvNames(
  env = {},
  knownPresentNames = undefined,
) {
  const presentNames = normalizeKnownPresentNames(knownPresentNames);

  return Array.from(new Set([...Object.keys(env), ...presentNames]))
    .filter(
      (name) =>
        !isAllowedVercelEnvName(name) && !isForbiddenVercelEnvName(name),
    )
    .sort((left, right) => left.localeCompare(right));
}

function formatUnexpectedVercelEnvWarning(
  names,
  contextLabel = "Vercel environment",
) {
  return [
    `Unexpected ${contextLabel} variables detected:`,
    names.map((name) => `- ${name}`).join("\n"),
    "These variables are not in the StreamOS Vercel allowlist and should be reviewed.",
  ].join("\n");
}

function isSet(env, name) {
  return normalizeEnvValue(env?.[name]) !== "";
}

function normalizeKnownPresentNames(knownPresentNames) {
  if (knownPresentNames instanceof Set) {
    return knownPresentNames;
  }

  if (Array.isArray(knownPresentNames)) {
    return new Set(knownPresentNames);
  }

  return new Set();
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
  {
    knownPresentNames = undefined,
    requireRequired = false,
    validatePublicUrls = false,
  } = {},
) {
  const issues = [];
  const presentNames = normalizeKnownPresentNames(knownPresentNames);

  if (requireRequired) {
    for (const name of REQUIRED_VERCEL_ENV_NAMES) {
      if (!isSet(env, name) && !presentNames.has(name)) {
        issues.push({
          name,
          reason: `${name} is required in the Vercel environment.`,
        });
      }
    }
  }

  for (const name of Array.from(
    new Set([...Object.keys(env), ...presentNames]),
  ).sort((left, right) => left.localeCompare(right))) {
    if (isForbiddenVercelEnvName(name)) {
      issues.push({
        name,
        reason: "This secret must only be set on Railway, not on Vercel.",
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

function assertNoForbiddenVercelEnv(
  env = {},
  { contextLabel = "Vercel environment", knownPresentNames = undefined } = {},
) {
  const names = findForbiddenVercelEnvNames(env, knownPresentNames);

  if (names.length > 0) {
    throw new Error(formatForbiddenVercelEnvError(names, contextLabel));
  }
}

function assertVercelEnvironment(
  env = {},
  {
    contextLabel = "Vercel environment",
    knownPresentNames = undefined,
    requireRequired = false,
    validatePublicUrls = false,
  } = {},
) {
  const issues = collectVercelEnvironmentIssues(env, {
    knownPresentNames,
    requireRequired,
    validatePublicUrls,
  });

  if (issues.length > 0) {
    throw new Error(formatVercelEnvironmentIssues(issues, contextLabel));
  }
}

module.exports = {
  ALLOWED_VERCEL_ENV_NAMES,
  ALLOWED_VERCEL_ENV_PREFIXES,
  FORBIDDEN_OPENAI_PREFIX,
  FORBIDDEN_VERCEL_ENV_NAMES,
  FORBIDDEN_VERCEL_ENV_PREFIXES,
  PUBLIC_URL_VERCEL_ENV_NAMES,
  REQUIRED_VERCEL_ENV_NAMES,
  assertNoForbiddenVercelEnv,
  assertVercelEnvironment,
  collectUnexpectedVercelEnvNames,
  collectVercelEnvironmentIssues,
  findForbiddenVercelEnvNames,
  findForbiddenOpenAIEnvNames,
  formatForbiddenVercelEnvError,
  formatForbiddenOpenAIEnvError,
  formatUnexpectedVercelEnvWarning,
  formatVercelEnvironmentIssues,
  isAllowedVercelEnvName,
  isForbiddenVercelEnvName,
  matchesAnyPrefix,
  normalizeEnvValue,
  validatePublicUrl,
};
