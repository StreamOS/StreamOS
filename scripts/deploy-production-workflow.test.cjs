const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const WORKFLOW_PATH = join(
  __dirname,
  "..",
  ".github",
  "workflows",
  "deploy-production.yml",
);

function readWorkflow() {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

function extractJob(content, jobName) {
  const header = `\n  ${jobName}:\n`;
  const startIndex = content.indexOf(header);

  assert.notEqual(startIndex, -1, `Expected workflow job ${jobName} to exist`);

  const bodyStartIndex = startIndex + header.length;
  const remaining = content.slice(bodyStartIndex);
  const nextJobMatch = remaining.match(/\n {2}[A-Za-z0-9_-]+:\n/);
  const bodyEndIndex =
    nextJobMatch?.index === undefined
      ? content.length
      : bodyStartIndex + nextJobMatch.index;

  return content.slice(bodyStartIndex, bodyEndIndex);
}

function extractNeeds(jobContent) {
  const match = jobContent.match(/^ {4}needs:\n((?: {6}- [^\n]+\n)+)/m);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^- /, ""))
    .filter(Boolean);
}

test("production deployment workflow runs a hard production gate from release-gate-runner", () => {
  const content = readWorkflow();
  const gateJob = extractJob(content, "production-gate");

  assert.match(gateJob, /pnpm rollout:check:production/);
  assert.doesNotMatch(gateJob, /rollout:check:local/);
  assert.match(gateJob, /railway ssh/);
  assert.match(gateJob, /--service release-gate-runner/);
  assert.match(gateJob, /-- sh -lc/);
  assert.match(gateJob, /--expected-runner-commit '\$\{GITHUB_SHA\}'/);
  assert.match(gateJob, /write-production-gate-proof\.cjs/);
  assert.match(gateJob, /verify-production-gate-proof\.cjs/);
  assert.doesNotMatch(gateJob, /command_path/);
});

test("production gate fails closed when remote proof is missing or invalid", () => {
  const content = readWorkflow();
  const gateJob = extractJob(content, "production-gate");
  const remoteGateIndex = gateJob.indexOf("pnpm rollout:check:production");
  const proofWriteIndex = gateJob.indexOf("write-production-gate-proof.cjs");
  const proofLineIndex = gateJob.indexOf("proof_line=");
  const proofVerifyIndex = gateJob.indexOf("verify-production-gate-proof.cjs");
  const summaryIndex = gateJob.indexOf("Record production gate proof");

  assert.match(gateJob, /set \+e/);
  assert.match(gateJob, /ssh_status=\$\?/);
  assert.match(gateJob, /Remote production gate execution failed/);
  assert.match(gateJob, /STREAMOS_PRODUCTION_GATE_PROOF=/);
  assert.match(gateJob, /did not return a verifiable proof marker/);
  assert.match(gateJob, /--expected-rc-sha "\$\{GITHUB_SHA\}"/);
  assert.match(gateJob, /--expected-environment "\$\{RAILWAY_ENVIRONMENT\}"/);
  assert.match(gateJob, /--expected-run-id "\$\{GITHUB_RUN_ID\}"/);
  assert.match(gateJob, /--expected-run-attempt "\$\{GITHUB_RUN_ATTEMPT\}"/);
  assert.ok(
    remoteGateIndex > -1 && remoteGateIndex < proofWriteIndex,
    "remote proof marker must be written only after rollout:check:production",
  );
  assert.ok(
    proofWriteIndex < proofLineIndex && proofLineIndex < proofVerifyIndex,
    "workflow must extract and verify the remote proof marker",
  );
  assert.ok(
    proofVerifyIndex < summaryIndex || summaryIndex === -1,
    "success summary must not precede proof verification",
  );
});

test("production success and release jobs depend on the production gate", () => {
  const content = readWorkflow();
  const releaseJob = extractJob(content, "release");
  const notifyJob = extractJob(content, "notify");
  const blockedNotifyJob = extractJob(content, "notify-blocked");

  assert.ok(
    extractNeeds(releaseJob).includes("production-gate"),
    "release must wait for production-gate",
  );
  assert.match(releaseJob, /needs\.production-gate\.result == 'success'/);

  assert.ok(
    extractNeeds(notifyJob).includes("production-gate"),
    "success notification must wait for production-gate",
  );
  assert.match(notifyJob, /needs\.production-gate\.result == 'success'/);
  assert.match(notifyJob, /needs\.release\.result == 'success'/);

  assert.ok(
    extractNeeds(blockedNotifyJob).includes("production-gate"),
    "blocked notification must observe production-gate",
  );
  assert.match(blockedNotifyJob, /Production Release Blocked/);
});

test("production workflow does not create a release before gate proof", () => {
  const content = readWorkflow();
  const deployRailwayIndex = content.indexOf("\n  deploy-railway:");
  const productionGateIndex = content.indexOf("\n  production-gate:");
  const releaseIndex = content.indexOf("\n  release:");

  assert.ok(deployRailwayIndex > -1, "deploy-railway job should exist");
  assert.ok(productionGateIndex > -1, "production-gate job should exist");
  assert.ok(releaseIndex > -1, "release job should exist");
  assert.ok(
    deployRailwayIndex < productionGateIndex,
    "candidate Railway deploy should happen before gate proof",
  );
  assert.ok(
    productionGateIndex < releaseIndex,
    "GitHub release must happen after gate proof",
  );
});

test("production approval requires backend deployment for same-SHA gate proof", () => {
  const content = readWorkflow();
  const approvalJob = extractJob(content, "production-approval");

  assert.match(approvalJob, /DEPLOY_BACKEND_SERVICES/);
  assert.match(approvalJob, /deploy_backend_services=true is required/);
  assert.match(approvalJob, /release-gate-runner can prove/);
});

test("production workflow uses one canonical Railway production token name", () => {
  const content = readWorkflow();
  const gateJob = extractJob(content, "production-gate");

  assert.match(content, /RAILWAY_TOKEN_PRODUCTION/);
  assert.match(
    gateJob,
    /RAILWAY_TOKEN: \$\{\{ secrets\.RAILWAY_TOKEN_PRODUCTION \}\}/,
  );
  assert.doesNotMatch(content, /RAILWAY_API_TOKEN_PRODUCTION/);
});
