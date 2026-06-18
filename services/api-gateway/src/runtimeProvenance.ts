import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const API_GATEWAY_RUNTIME_PROVENANCE_PATH = "../runtime-provenance.json";
export const API_GATEWAY_RUNTIME_PROVENANCE_SCHEMA_VERSION = 1;
export const API_GATEWAY_RUNTIME_PROVENANCE_SERVICE = "api-gateway";

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
    /^[0-9a-f]{7,40}$/i.test(candidate.gitCommit) &&
    typeof candidate.gitRef === "string" &&
    typeof candidate.repository === "string" &&
    typeof candidate.runAttempt === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.workflow === "string"
  );
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
