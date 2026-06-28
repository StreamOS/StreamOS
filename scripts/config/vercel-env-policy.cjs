const {
  isPrivateAutomationHostname,
} = require("../lib/private-automation-url.cjs");

const FORBIDDEN_OPENAI_PREFIX = "NEXT_PUBLIC_OPENAI";

const ALLOWED_VERCEL_ENV_NAMES = new Set([
  "APP_ENV",
  "APP_URL",
  "API_GATEWAY_SECRET",
  "API_GATEWAY_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STREAMOS_DEMO_MODE",
]);

const ALLOWED_VERCEL_ENV_PREFIXES = ["NODE_", "VERCEL_", "npm_"];

const FORBIDDEN_VERCEL_ENV_NAMES = new Set([
  "ADMIN_SECRET",
  "APP_ENCRYPTION_KEY",
  "AUTOMATION_ENTITLEMENT_ASSERTION_SECRET",
  "AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE",
  "AUTOMATION_SERVICE_URL",
  "CRON_SECRET",
  "KICK_CLIENT_SECRET",
  "KICK_WEBHOOK_SECRET",
  "REDIS_TLS_URL",
  "REDIS_URL",
  "SB_SUPABASE_JWT_SECRET",
  "SB_SUPABASE_SECRET_KEY",
  "SB_SUPABASE_SERVICE_ROLE_KEY",
  "STREAM_EVENT_WEBHOOK_SECRET",
  "SUPABASE_DB_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "TWITCH_CLIENT_ID",
  "TWITCH_REDIRECT_URI",
  "TWITCH_SCOPES",
  "TWITCH_CLIENT_SECRET",
  "TWITCH_EVENTSUB_SECRET",
  "TWITCH_WEBHOOK_SECRET",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "YOUTUBE_API_KEY",
  "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_WEBHOOK_SECRET",
  "YOUTUBE_WEBSUB_SECRET",
  "YOUTUBE_WEBSUB_VERIFY_TOKEN",
]);

const FORBIDDEN_VERCEL_ENV_PREFIXES = [
  FORBIDDEN_OPENAI_PREFIX,
  "OPENAI_",
  "SB_POSTGRES_",
  "RAILWAY_",
  "REDIS_",
  "REPLICATE_",
  "UPSTASH_REDIS_",
];

const IGNORED_UNEXPECTED_VERCEL_ENV_NAMES = new Set([
  "__NEXT_PROCESSED_ENV",
  "__PSLOCKDOWNPOLICY",
  "ALLUSERSPROFILE",
  "APPDATA",
  "BESIEGE_GAME_ASSEMBLIES",
  "BESIEGE_UNITY_ASSEMBLIES",
  "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
  "CODEX_SHELL",
  "CODEX_THREAD_ID",
  "COMMONPROGRAMFILES",
  "COMMONPROGRAMFILES(X86)",
  "COMMONPROGRAMW6432",
  "COMPUTERNAME",
  "COMSPEC",
  "COREPACK_ENABLE_DOWNLOAD_PROMPT",
  "COREPACK_ROOT",
  "DISABLE_AUTO_UPDATE",
  "DRIVERDATA",
  "HOMEDRIVE",
  "HOMEPATH",
  "INIT_CWD",
  "IS_NEXT_WORKER",
  "JEST_WORKER_ID",
  "LOCALAPPDATA",
  "LOG_FORMAT",
  "LOGONSERVER",
  "NEXT_DEPLOYMENT_ID",
  "NEXT_PRIVATE_BUILD_WORKER",
  "NEXT_PRIVATE_START_TIME",
  "NEXT_RUNTIME",
  "NODE",
  "NUMBER_OF_PROCESSORS",
  "ONEDRIVE",
  "OS",
  "PATH",
  "PATHEXT",
  "PNPM_SCRIPT_SRC_DIR",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "PROCESSOR_LEVEL",
  "PROCESSOR_REVISION",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "PROGRAMW6432",
  "PROMPT",
  "PSMODULEPATH",
  "PUBLIC",
  "RUST_LOG",
  "RUST_MIN_STACK",
  "SHELL",
  "SPLM_LICENSE_SERVER",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TURBOPACK",
  "UGII_LANG",
  "USERDOMAIN",
  "USERDOMAIN_ROAMINGPROFILE",
  "USERDOMAINROAMINGPROFILE",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
  "ZSH_TMUX_AUTOSTART",
  "ZSH_TMUX_AUTOSTARTED",
]);

const IGNORED_UNEXPECTED_VERCEL_ENV_PREFIXES = [
  "__",
  "BESIEGE_",
  "CODEX_",
  "COREPACK_",
  "NODE",
  "PNPM_",
  "PROCESSOR_",
  "TURBO_",
  "ZSH_TMUX_",
];

const REQUIRED_VERCEL_ENV_NAMES = [
  "API_GATEWAY_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
];

const REQUIRED_VERCEL_ENV_ONE_OF_GROUPS = [
  {
    names: ["APP_URL", "NEXT_PUBLIC_APP_URL"],
    reason:
      "At least one canonical app origin must be configured in the Vercel environment.",
  },
  {
    names: [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ],
    reason:
      "At least one public Supabase browser key must be configured in the Vercel environment.",
  },
];

const PUBLIC_URL_VERCEL_ENV_NAMES = new Set([
  "APP_URL",
  "API_GATEWAY_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
]);

function normalizeEnvValue(value) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function matchesAnyPrefix(name, prefixes) {
  return prefixes.some((prefix) => name.startsWith(prefix));
}

function normalizeEnvName(name) {
  return typeof name === "string" ? name.trim().toUpperCase() : "";
}

function isAllowedVercelEnvName(name) {
  return (
    ALLOWED_VERCEL_ENV_NAMES.has(name) ||
    matchesAnyPrefix(name, ALLOWED_VERCEL_ENV_PREFIXES)
  );
}

function isIgnoredUnexpectedVercelEnvName(name) {
  const normalizedName = normalizeEnvName(name);

  return (
    IGNORED_UNEXPECTED_VERCEL_ENV_NAMES.has(normalizedName) ||
    matchesAnyPrefix(normalizedName, IGNORED_UNEXPECTED_VERCEL_ENV_PREFIXES)
  );
}

function isForbiddenVercelEnvName(name) {
  return (
    FORBIDDEN_VERCEL_ENV_NAMES.has(name) ||
    matchesAnyPrefix(name, FORBIDDEN_VERCEL_ENV_PREFIXES)
  );
}

function getForbiddenVercelEnvReason(name) {
  if (name === "APP_ENCRYPTION_KEY") {
    return "Encryption keys belong in trusted Railway services, not apps/web on Vercel.";
  }

  if (
    name === "AUTOMATION_ENTITLEMENT_ASSERTION_SECRET" ||
    name === "AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE"
  ) {
    return "Automation entitlement assertion signing belongs in services/api-gateway and services/automation-service on Railway, not apps/web on Vercel.";
  }

  if (
    name === "SUPABASE_SERVICE_ROLE_KEY" ||
    name === "SUPABASE_DB_URL" ||
    name === "SB_SUPABASE_JWT_SECRET" ||
    name === "SB_SUPABASE_SECRET_KEY" ||
    name === "SB_SUPABASE_SERVICE_ROLE_KEY" ||
    name.startsWith("SB_POSTGRES_")
  ) {
    return "Privileged Supabase database access belongs in Railway services/workers, not apps/web on Vercel.";
  }

  if (name === "AUTOMATION_SERVICE_URL" || name.startsWith("RAILWAY_")) {
    return "Private Railway service URLs and runtime secrets must not be configured in apps/web on Vercel.";
  }

  if (
    name === "REDIS_URL" ||
    name === "REDIS_TLS_URL" ||
    name.startsWith("REDIS_") ||
    name.startsWith("UPSTASH_REDIS_")
  ) {
    return "Redis and BullMQ credentials belong in Railway services/workers, not apps/web on Vercel.";
  }

  if (name.startsWith("OPENAI_") || name.startsWith(FORBIDDEN_OPENAI_PREFIX)) {
    return "OpenAI credentials belong in services/automation-service, not apps/web on Vercel.";
  }

  if (name.startsWith("REPLICATE_")) {
    return "AI provider credentials belong in services/automation-service, not apps/web on Vercel.";
  }

  if (
    [
      "TWITCH_CLIENT_ID",
      "TWITCH_REDIRECT_URI",
      "TWITCH_SCOPES",
      "KICK_CLIENT_SECRET",
      "KICK_WEBHOOK_SECRET",
      "STREAM_EVENT_WEBHOOK_SECRET",
      "TIKTOK_CLIENT_KEY",
      "TIKTOK_CLIENT_SECRET",
      "TWITCH_CLIENT_SECRET",
      "TWITCH_EVENTSUB_SECRET",
      "TWITCH_WEBHOOK_SECRET",
      "YOUTUBE_API_KEY",
      "YOUTUBE_CLIENT_SECRET",
      "YOUTUBE_WEBHOOK_SECRET",
      "YOUTUBE_WEBSUB_SECRET",
      "YOUTUBE_WEBSUB_VERIFY_TOKEN",
    ].includes(name)
  ) {
    return "Provider OAuth, webhook, and verification secrets belong in services/api-gateway on Railway, not apps/web on Vercel.";
  }

  if (name === "ADMIN_SECRET" || name === "CRON_SECRET") {
    return "Administrative shared secrets belong in trusted Railway services, not apps/web on Vercel.";
  }

  return "This variable must not be configured in apps/web on Vercel.";
}

function findForbiddenOpenAIEnvNames(env = {}) {
  return Object.keys(env)
    .filter((name) => name.startsWith(FORBIDDEN_OPENAI_PREFIX))
    .sort((left, right) => left.localeCompare(right));
}

function formatForbiddenOpenAIEnvError(names, contextLabel = "web app") {
  return `${names.join(", ")} must not be configured in the ${contextLabel}. OpenAI keys are server-only and belong in services/automation-service as OPENAI_API_KEY.`;
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
    ...names.map((name) => `- ${name}: ${getForbiddenVercelEnvReason(name)}`),
  ].join("\n");
}

function collectUnexpectedVercelEnvNames(
  env = {},
  knownPresentNames = undefined,
) {
  const presentNames = normalizeKnownPresentNames(knownPresentNames);

  return Array.from(new Set([...Object.keys(env), ...presentNames]))
    .filter((name) => {
      if (isAllowedVercelEnvName(name) || isForbiddenVercelEnvName(name)) {
        return false;
      }

      return !isIgnoredUnexpectedVercelEnvName(name);
    })
    .sort((left, right) => left.localeCompare(right));
}

function formatUnexpectedVercelEnvWarning(
  names,
  contextLabel = "Vercel environment",
) {
  return [
    `Unexpected ${contextLabel} variables detected:`,
    names.map((name) => `- ${name}`).join("\n"),
    "These variables are outside the StreamOS apps/web Vercel contract and should be reviewed for Vercel, Railway, or local-only ownership.",
  ].join("\n");
}

function isSet(env, name) {
  return normalizeEnvValue(env?.[name]) !== "";
}

function hasAnyConfiguredValue(env, names, presentNames) {
  return names.some((name) => isSet(env, name) || presentNames.has(name));
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

    for (const group of REQUIRED_VERCEL_ENV_ONE_OF_GROUPS) {
      if (!hasAnyConfiguredValue(env, group.names, presentNames)) {
        issues.push({
          name: group.names.join(" | "),
          reason: group.reason,
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
        reason: getForbiddenVercelEnvReason(name),
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
  REQUIRED_VERCEL_ENV_ONE_OF_GROUPS,
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
  getForbiddenVercelEnvReason,
  hasAnyConfiguredValue,
  isAllowedVercelEnvName,
  isForbiddenVercelEnvName,
  matchesAnyPrefix,
  normalizeEnvValue,
  validatePublicUrl,
};
