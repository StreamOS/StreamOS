import { createHmac, timingSafeEqual } from "node:crypto";

import {
  AUTOMATION_ENTITLEMENT_ASSERTION_MIN_SECRET_LENGTH,
  AUTOMATION_ENTITLEMENT_ASSERTION_SECRET_ENV_NAME,
  AUTOMATION_ENTITLEMENT_ASSERTION_SIGNATURE_ALGORITHM,
  AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODES,
  AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE_ENV_NAME,
  isAutomationEntitlementAssertionSigningMode,
  serializeAutomationEntitlementAssertion,
  type AutomationEntitlementAssertion,
  type AutomationEntitlementAssertionSigningMode,
  type SignedAutomationEntitlementAssertion,
} from "@streamos/types";

import {
  issueAutomationEntitlementAssertion,
  type GatewayAutomationEntitlementAssertionIssueResult,
} from "./automation-entitlement-issuer.js";

export type GatewayAutomationEntitlementSigningConfig = {
  mode: AutomationEntitlementAssertionSigningMode;
  secret: string | null;
  secretEnvName: typeof AUTOMATION_ENTITLEMENT_ASSERTION_SECRET_ENV_NAME;
  signingModeEnvName: typeof AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE_ENV_NAME;
};

export type GatewaySignedAutomationEntitlementAssertionIssueResult =
  GatewayAutomationEntitlementAssertionIssueResult & {
    signedAssertion: SignedAutomationEntitlementAssertion | null;
  };

export function resolveAutomationEntitlementAssertionSigningConfig(
  params: {
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    mode?: string | undefined;
    secret?: string | undefined;
  } = {},
): GatewayAutomationEntitlementSigningConfig {
  const env = params.env ?? process.env;
  const rawMode =
    params.mode ??
    env[AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE_ENV_NAME] ??
    "unsigned_internal_contract";
  const mode = rawMode.trim();

  if (!isAutomationEntitlementAssertionSigningMode(mode)) {
    throw new Error(
      `${AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE_ENV_NAME} must be one of: ${AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODES.join(", ")}.`,
    );
  }

  const secret =
    params.secret ??
    env[AUTOMATION_ENTITLEMENT_ASSERTION_SECRET_ENV_NAME] ??
    null;
  const normalizedSecret = normalizeSecret(secret);

  if (mode === "hmac_sha256") {
    assertSigningSecret(normalizedSecret);
  }

  return {
    mode,
    secret: normalizedSecret,
    secretEnvName: AUTOMATION_ENTITLEMENT_ASSERTION_SECRET_ENV_NAME,
    signingModeEnvName: AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE_ENV_NAME,
  };
}

export function signAutomationEntitlementAssertion(params: {
  assertion: AutomationEntitlementAssertion;
  secret: string;
}): SignedAutomationEntitlementAssertion {
  const secret = normalizeSecret(params.secret);

  assertSigningSecret(secret);

  return {
    assertion: params.assertion,
    signature: createAutomationEntitlementAssertionSignature({
      assertion: params.assertion,
      secret,
    }),
    signing_mode: "hmac_sha256",
  };
}

export function verifyAutomationEntitlementAssertionSignature(params: {
  assertion: AutomationEntitlementAssertion;
  secret: string;
  signature: string | null | undefined;
}): boolean {
  const secret = normalizeSecret(params.secret);
  const signature = normalizeNonEmptyString(params.signature);

  if (signature === null) {
    return false;
  }

  assertSigningSecret(secret);

  const expected = createAutomationEntitlementAssertionSignature({
    assertion: params.assertion,
    secret,
  });
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    receivedBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function issueSignedAutomationEntitlementAssertion(
  params: Parameters<typeof issueAutomationEntitlementAssertion>[0] & {
    secret: string;
  },
): GatewaySignedAutomationEntitlementAssertionIssueResult {
  const issued = issueAutomationEntitlementAssertion(params);

  if (!issued.allowed || issued.assertion === null) {
    return {
      ...issued,
      signedAssertion: null,
    };
  }

  return {
    ...issued,
    signedAssertion: signAutomationEntitlementAssertion({
      assertion: issued.assertion,
      secret: params.secret,
    }),
  };
}

function createAutomationEntitlementAssertionSignature(params: {
  assertion: AutomationEntitlementAssertion;
  secret: string;
}): string {
  return createHmac("sha256", params.secret)
    .update(serializeAutomationEntitlementAssertion(params.assertion))
    .digest("hex");
}

function assertSigningSecret(secret: string | null): asserts secret is string {
  if (!secret) {
    throw new Error(
      `${AUTOMATION_ENTITLEMENT_ASSERTION_SECRET_ENV_NAME} is required when ${AUTOMATION_ENTITLEMENT_ASSERTION_SIGNING_MODE_ENV_NAME}=hmac_sha256.`,
    );
  }

  if (secret.length < AUTOMATION_ENTITLEMENT_ASSERTION_MIN_SECRET_LENGTH) {
    throw new Error(
      `${AUTOMATION_ENTITLEMENT_ASSERTION_SECRET_ENV_NAME} must be at least ${AUTOMATION_ENTITLEMENT_ASSERTION_MIN_SECRET_LENGTH} characters for ${AUTOMATION_ENTITLEMENT_ASSERTION_SIGNATURE_ALGORITHM}.`,
    );
  }
}

function normalizeSecret(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNonEmptyString(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
