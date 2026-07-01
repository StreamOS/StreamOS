import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const API_GATEWAY_RUNTIME_PROVENANCE_PATH = "../runtime-provenance.json";
export const API_GATEWAY_RUNTIME_PROVENANCE_SCHEMA_VERSION = 1;
export const API_GATEWAY_RUNTIME_PROVENANCE_SERVICE = "api-gateway";
export const API_GATEWAY_RUNTIME_PROVENANCE_UNKNOWN = "unknown";

const SAFE_RUNTIME_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i;
const SAFE_GIT_COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

export type ApiGatewayRuntimeProvenance = {
  environment: string;
  generatedAt: string;
  gitCommit: string;
  gitRef: string;
  repository: string;
  runAttempt: string;
  runId: string;
  schemaVersion: number;
  service: string;
  workflow: string;
};

export type ApiGatewayHealthRuntimeProvenance = {
  environment: string;
  gitCommit: string;
  service: string;
};

function isApiGatewayRuntimeProvenance(
  record: unknown,
): record is ApiGatewayRuntimeProvenance {
  if (!record || typeof record !== "object") {
    return false;
  }

  const candidate = record as Partial<ApiGatewayRuntimeProvenance>;

  return (
    candidate.schemaVersion === API_GATEWAY_RUNTIME_PROVENANCE_SCHEMA_VERSION &&
    candidate.service === API_GATEWAY_RUNTIME_PROVENANCE_SERVICE &&
    typeof candidate.environment === "string" &&
    candidate.environment.length > 0 &&
    typeof candidate.generatedAt === "string" &&
    candidate.generatedAt.length > 0 &&
    typeof candidate.gitCommit === "string" &&
    SAFE_GIT_COMMIT_PATTERN.test(candidate.gitCommit) &&
    typeof candidate.gitRef === "string" &&
    typeof candidate.repository === "string" &&
    typeof candidate.runAttempt === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.workflow === "string"
  );
}

function readSafeValue(value: string | undefined, pattern: RegExp): string | null {
  const trimmed = value?.trim();

  if (!trimmed || !pattern.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function readSafeRuntimeLabel(value: string | undefined): string | null {
  return readSafeValue(value, SAFE_RUNTIME_LABEL_PATTERN);
}

function readSafeGitCommit(value: string | undefined): string | null {
  return readSafeValue(value, SAFE_GIT_COMMIT_PATTERN);
}

export function readApiGatewayRuntimeProvenance(): ApiGatewayRuntimeProvenance | null {
  const provenancePath = fileURLToPath(
    new URL(API_GATEWAY_RUNTIME_PROVENANCE_PATH, import.meta.url),
  );

  if (!existsSync(provenancePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(provenancePath, "utf8"));
    return isApiGatewayRuntimeProvenance(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveApiGatewayHealthRuntimeProvenance({
  env = process.env,
  runtimeProvenance,
}: {
  env?: NodeJS.ProcessEnv;
  runtimeProvenance?: ApiGatewayRuntimeProvenance | null;
} = {}): ApiGatewayHealthRuntimeProvenance {
  return {
    service:
      readSafeRuntimeLabel(runtimeProvenance?.service) ??
      readSafeRuntimeLabel(env.RAILWAY_SERVICE_NAME) ??
      readSafeRuntimeLabel(env.RAILWAY_SERVICE) ??
      API_GATEWAY_RUNTIME_PROVENANCE_SERVICE,
    gitCommit:
      readSafeGitCommit(runtimeProvenance?.gitCommit) ??
      readSafeGitCommit(env.STREAM_OS_RC_COMMIT_SHA) ??
      readSafeGitCommit(env.STREAMOS_RC_COMMIT_SHA) ??
      readSafeGitCommit(env.RAILWAY_GIT_COMMIT_SHA) ??
      API_GATEWAY_RUNTIME_PROVENANCE_UNKNOWN,
    environment:
      readSafeRuntimeLabel(runtimeProvenance?.environment) ??
      readSafeRuntimeLabel(env.RAILWAY_ENVIRONMENT_NAME) ??
      readSafeRuntimeLabel(env.RAILWAY_ENVIRONMENT) ??
      readSafeRuntimeLabel(env.APP_ENV) ??
      API_GATEWAY_RUNTIME_PROVENANCE_UNKNOWN,
  };
}
