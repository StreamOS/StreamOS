const protectedBranches = new Set(["main", "develop", "staging", "production"]);
const protectedPatterns = [/^release\/.+$/];
const temporaryOpsPrefixes = ["backup/", "codex/"];
const allowedTypes = new Set(["feature", "fix", "chore", "release"]);
const allowedScopes = new Set([
  "web",
  "api-gateway",
  "automation",
  "workers",
  "packages",
  "infra",
]);

const scopeKeywords = {
  automation: ["ai", "automation", "fastapi", "openai", "replicate", "whisper"],
  "api-gateway": [
    "api",
    "auth",
    "callback",
    "eventsub",
    "gateway",
    "kick",
    "oauth",
    "tiktok",
    "twitch",
    "webhook",
    "youtube",
  ],
  infra: [
    "ci",
    "config",
    "deploy",
    "deployment",
    "env",
    "environment",
    "governance",
    "github",
    "oidc",
    "production",
    "railway",
    "release",
    "repo",
    "rollback",
    "staging",
    "supabase",
    "tooling",
    "validation",
    "vercel",
    "workflow",
  ],
  packages: [
    "database",
    "package",
    "packages",
    "schema",
    "shared",
    "types",
    "workspace",
  ],
  web: [
    "app",
    "branding",
    "dashboard",
    "frontend",
    "next",
    "tailwind",
    "ui",
    "web",
  ],
  workers: [
    "bullmq",
    "clip",
    "job",
    "queue",
    "redis",
    "retry",
    "stream",
    "transcription",
    "worker",
    "workers",
  ],
};

const typeAliases = {
  bugfix: "fix",
  build: "chore",
  chore: "chore",
  ci: "chore",
  docs: "chore",
  feat: "feature",
  feature: "feature",
  fix: "fix",
  hotfix: "fix",
  perf: "chore",
  refactor: "chore",
  release: "release",
  test: "chore",
};

const referencePaths = [".github/workflows", "docs/deployment.md"];
const workflowSensitiveBaseBranches = new Set(["main", "develop"]);
const workflowSensitiveBasePatterns = [/^release\/.+$/];
const workflowAuditMappings = [
  {
    auditExpectation: "rollback.yml",
    repoSource: ".github/workflows/main.yml",
    note: "StreamOS uses the manual rollback workflow in main.yml.",
  },
  {
    auditExpectation: "Railway SSH smoke verification workflow",
    repoSource:
      ".github/workflows/smoke-production-manual.yml + pnpm rollout:check",
    note: "StreamOS currently validates protected production access with OIDC smoke plus rollout verification.",
  },
  {
    auditExpectation: "deploy-staging on develop",
    repoSource: "release/*",
    note: "StreamOS staging deployments stay bound to release/*, not develop.",
  },
];
const runtimeFollowUpRules = [
  {
    gate: "pnpm vercel:audit -- --vercel-dir .vercel --environment <preview|production>",
    when: "Vercel or web deployment relevance is detected.",
  },
  {
    gate: "pnpm railway:audit -- --env <staging|production> --format markdown",
    when: "Railway deploy, environment, or secret-scope relevance is detected.",
  },
  {
    gate: "pnpm rollout:check -- --env-file .env.test",
    when: "Staging, production, rollback, smoke, or private-network verification is in scope.",
  },
];

module.exports = {
  activeDevelopmentDays: 30,
  abandonedDays: 60,
  allowedScopes,
  allowedTypes,
  protectedBranches,
  protectedPatterns,
  referencePaths,
  runtimeFollowUpRules,
  scopeKeywords,
  temporaryOpsPrefixes,
  typeAliases,
  workflowAuditMappings,
  workflowSensitiveBaseBranches,
  workflowSensitiveBasePatterns,
};
