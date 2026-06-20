const path = require("node:path");

const {
  DEFAULT_AUTOMATION_SERVICE_NAME,
  assertPrivateAutomationServiceUrl,
  isPrivateAutomationHostname,
  isPrivateIpAddress,
} = require("./private-automation-url.cjs");

function compileGlob(pattern) {
  const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escapedPattern.replace(/\*/g, ".*")}$`);
}

function matchesPattern(name, pattern) {
  if (pattern.includes("*")) {
    return compileGlob(pattern).test(name);
  }

  if (pattern.startsWith("_")) {
    return name.endsWith(pattern);
  }

  return name === pattern || name.endsWith(pattern);
}

function matchesAnyPattern(name, patterns = []) {
  return patterns.some((pattern) => matchesPattern(name, pattern));
}

function isPlaceholderValue(value) {
  const normalizedValue = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalizedValue) {
    return false;
  }

  return [
    "replace-with",
    "changeme",
    "change-me",
    "placeholder",
    "your-",
    "your_",
    "todo",
    "dummy",
    "example.com",
    "example.org",
    "example.net",
  ].some((token) => normalizedValue.includes(token));
}

function redactUrl(value) {
  try {
    const parsedUrl = new URL(String(value));
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch {
    return "invalid-format";
  }
}

function normalizeBoolean(value) {
  const normalizedValue = String(value || "")
    .trim()
    .toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  return undefined;
}

function normalizeInteger(value) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue)) {
    return undefined;
  }

  return parsedValue;
}

function normalizeNumber(value) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return undefined;
  }

  return parsedValue;
}

function parseVariablePayload(payload) {
  if (Array.isArray(payload)) {
    return Object.fromEntries(
      payload
        .map((entry) => {
          if (Array.isArray(entry) && entry.length >= 2) {
            return [String(entry[0]), entry[1]];
          }

          if (!entry || typeof entry !== "object") {
            return undefined;
          }

          const name =
            entry.name ?? entry.key ?? entry.variable ?? entry.variableName;

          if (typeof name !== "string") {
            return undefined;
          }

          return [name, entry.value ?? entry.rawValue ?? ""];
        })
        .filter(Boolean),
    );
  }

  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.variables)) {
      return parseVariablePayload(payload.variables);
    }

    return Object.fromEntries(
      Object.entries(payload).filter(
        ([key, value]) =>
          typeof key === "string" &&
          key.length > 0 &&
          value !== null &&
          value !== undefined,
      ),
    );
  }

  return {};
}

function parseServiceListPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.services)) {
    return payload.services;
  }

  return [];
}

function getServiceListEntry(serviceList, serviceName) {
  const listedServices = parseServiceListPayload(serviceList);
  return listedServices.find((entry) => entry.name === serviceName) ?? null;
}

function getConfiguredService(environmentConfig, serviceName, serviceId) {
  return (
    environmentConfig?.servicesByName?.[serviceName] ??
    (serviceId ? environmentConfig?.servicesById?.[serviceId] : undefined) ??
    null
  );
}

function hasServiceInventoryEntry({
  environmentConfig,
  serviceList,
  serviceName,
}) {
  const listedService = getServiceListEntry(serviceList, serviceName);
  const configuredService = getConfiguredService(
    environmentConfig,
    serviceName,
    listedService?.id,
  );

  return Boolean(listedService && configuredService);
}

function getServicePublicUrl(serviceList, serviceName) {
  const services = parseServiceListPayload(serviceList);
  const service = services.find((entry) => entry.name === serviceName);
  return service?.url ?? null;
}

function parseEnvironmentConfigPayload(payload) {
  const servicesByName = {};
  const servicesById = {};
  const services = payload?.services ?? {};

  for (const [serviceId, serviceConfig] of Object.entries(services)) {
    const serviceName =
      serviceConfig?.name ??
      serviceConfig?.service?.name ??
      serviceConfig?.serviceName ??
      serviceId;

    servicesByName[serviceName] = {
      id: serviceId,
      name: serviceName,
      networking: serviceConfig?.networking ?? {},
      variables: parseVariablePayload(serviceConfig?.variables ?? {}),
    };
    servicesById[serviceId] = {
      id: serviceId,
      name: serviceName,
      networking: serviceConfig?.networking ?? {},
      variables: parseVariablePayload(serviceConfig?.variables ?? {}),
    };
  }

  return {
    privateNetworkDisabled:
      payload?.privateNetworkDisabled === true ||
      payload?.private_network_disabled === true,
    servicesById,
    servicesByName,
  };
}

function buildOwnershipIndex(whitelist) {
  const ownership = new Map();

  for (const [serviceName, serviceConfig] of Object.entries(
    whitelist.services,
  )) {
    for (const variableName of [
      ...serviceConfig.required,
      ...serviceConfig.optional,
    ]) {
      const owners = ownership.get(variableName) ?? new Set();
      owners.add(serviceName);
      ownership.set(variableName, owners);
    }
  }

  return ownership;
}

function isSecretVariable(variableName, whitelist) {
  return matchesAnyPattern(variableName, whitelist.sensitiveNamePatterns);
}

function createFinding({
  environment,
  flag,
  message,
  priority,
  serviceName,
  variableName,
}) {
  return {
    environment,
    flag,
    message,
    priority,
    service: serviceName,
    variable: variableName,
  };
}

function getFindingPriority({ environment, flag, variableName, whitelist }) {
  let priority = whitelist.priorityMap.default[flag] ?? "LOW";

  if (
    environment === "production" &&
    flag === "MISSING" &&
    whitelist.priorityMap.productionCriticalMissing.includes(variableName)
  ) {
    priority = "CRITICAL";
  }

  if (
    environment === "production" &&
    flag === "INVALID_FORMAT" &&
    whitelist.priorityMap.productionCriticalInvalid.includes(variableName)
  ) {
    priority = "CRITICAL";
  }

  return priority;
}

function validateBase64Key(value) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return "Value is empty.";
  }

  if (trimmedValue.startsWith("hex:")) {
    return "APP_ENCRYPTION_KEY must use base64, not hex.";
  }

  const encodedValue = trimmedValue.startsWith("base64:")
    ? trimmedValue.slice("base64:".length)
    : trimmedValue;

  const decodedValue = Buffer.from(encodedValue, "base64");

  if (decodedValue.length !== 32) {
    return "APP_ENCRYPTION_KEY must decode to exactly 32 bytes.";
  }

  return undefined;
}

function validateUrlValue({
  allowPrivateHosts = false,
  protocols,
  rejectPrivateHosts = false,
  value,
}) {
  let parsedUrl;

  try {
    parsedUrl = new URL(String(value));
  } catch {
    return {
      error: "Value must be a valid absolute URL.",
    };
  }

  if (protocols && !protocols.includes(parsedUrl.protocol)) {
    return {
      error: `URL must use one of: ${protocols.join(", ")}.`,
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isPrivateHost =
    hostname === "localhost" ||
    isPrivateIpAddress(hostname) ||
    isPrivateAutomationHostname(hostname, {
      expectedServiceName: DEFAULT_AUTOMATION_SERVICE_NAME,
    });

  if (rejectPrivateHosts && isPrivateHost) {
    return {
      error: "URL must not use localhost, private IPs, or railway.internal.",
    };
  }

  if (!allowPrivateHosts && hostname.endsWith(".internal")) {
    return {
      error: "URL must not use an internal hostname.",
    };
  }

  return {
    summary: redactUrl(value),
  };
}

function validateVariable({
  effectiveValues,
  environment,
  serviceName,
  value,
  validator,
  variableName,
}) {
  if (isPlaceholderValue(value)) {
    return {
      error: "Value looks like a placeholder.",
    };
  }

  if (
    !validator ||
    validator.kind === "string" ||
    validator.kind === "scopes"
  ) {
    return {
      summary: "present",
    };
  }

  switch (validator.kind) {
    case "automation-url": {
      try {
        return {
          summary: redactUrl(
            assertPrivateAutomationServiceUrl(value, {
              consumerName: serviceName,
              expectedServiceName: DEFAULT_AUTOMATION_SERVICE_NAME,
            }),
          ),
        };
      } catch (error) {
        return {
          error: error.message,
        };
      }
    }
    case "base64-32-bytes": {
      const error = validateBase64Key(value);
      return error ? { error } : { summary: "present" };
    }
    case "boolean": {
      if (normalizeBoolean(value) === undefined) {
        return {
          error: "Value must be either true or false.",
        };
      }

      return {
        summary: "present",
      };
    }
    case "csv-urls": {
      const urls = String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (urls.length === 0) {
        return {
          error: "At least one URL is required.",
        };
      }

      for (const entry of urls) {
        const result = validateUrlValue({
          protocols: validator.protocols,
          rejectPrivateHosts: validator.rejectPrivateHosts,
          value: entry,
        });

        if (result.error) {
          return result;
        }
      }

      return {
        summary: urls.map(redactUrl).join(", "),
      };
    }
    case "enum": {
      const normalizedValue = String(value || "")
        .trim()
        .toLowerCase();

      if (!validator.allowed.includes(normalizedValue)) {
        return {
          error: `Value must be one of: ${validator.allowed.join(", ")}.`,
        };
      }

      if (
        variableName === "NODE_ENV" &&
        environment === "production" &&
        normalizedValue !== "production"
      ) {
        return {
          error: "NODE_ENV must be production in the production environment.",
        };
      }

      if (variableName === "TRANSCRIPTION_PROCESSOR_MODE") {
        const e2eMode = normalizeBoolean(
          effectiveValues.STREAMOS_E2E_MODE ?? "false",
        );

        if (normalizedValue !== "openai" && e2eMode !== true) {
          return {
            error:
              "TRANSCRIPTION_PROCESSOR_MODE stub/fail is only allowed with STREAMOS_E2E_MODE=true.",
          };
        }

        if (environment === "production" && normalizedValue !== "openai") {
          return {
            error:
              "TRANSCRIPTION_PROCESSOR_MODE must stay openai in production.",
          };
        }
      }

      return {
        summary: normalizedValue,
      };
    }
    case "integer": {
      const parsedValue = normalizeInteger(value);

      if (parsedValue === undefined) {
        return {
          error: "Value must be an integer.",
        };
      }

      if (
        (validator.min !== undefined && parsedValue < validator.min) ||
        (validator.max !== undefined && parsedValue > validator.max)
      ) {
        return {
          error: `Value must be between ${validator.min} and ${validator.max}.`,
        };
      }

      return {
        summary: "present",
      };
    }
    case "number": {
      const parsedValue = normalizeNumber(value);

      if (parsedValue === undefined) {
        return {
          error: "Value must be a number.",
        };
      }

      if (validator.min !== undefined && parsedValue < validator.min) {
        return {
          error: `Value must be greater than or equal to ${validator.min}.`,
        };
      }

      return {
        summary: "present",
      };
    }
    case "url": {
      return validateUrlValue({
        allowPrivateHosts: validator.allowPrivateHosts,
        protocols: validator.protocols,
        rejectPrivateHosts: validator.rejectPrivateHosts,
        value,
      });
    }
    default:
      return {
        summary: "present",
      };
  }
}

function summarizeValue({ validator, value, variableName, whitelist }) {
  if (value === undefined) {
    return "missing";
  }

  const trimmedValue = String(value).trim();

  if (!trimmedValue) {
    return "empty";
  }

  if (isPlaceholderValue(trimmedValue)) {
    return "placeholder";
  }

  if (isSecretVariable(variableName, whitelist)) {
    return "present";
  }

  if (validator?.kind === "url" || validator?.kind === "csv-urls") {
    if (validator.kind === "csv-urls") {
      return String(value)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map(redactUrl)
        .join(", ");
    }

    return redactUrl(trimmedValue);
  }

  if (validator?.kind === "automation-url") {
    try {
      return redactUrl(
        assertPrivateAutomationServiceUrl(trimmedValue, {
          consumerName: "audit",
        }),
      );
    } catch {
      return "invalid-format";
    }
  }

  return "present";
}

function evaluateManagedVariable({
  effectiveValues,
  environment,
  serviceConfig,
  serviceName,
  serviceVariables,
  sharedVariables,
  variableName,
  whitelist,
}) {
  const sharedValue = sharedVariables[variableName];
  const serviceValue = serviceVariables[variableName];
  const hasSharedValue = sharedValue !== undefined;
  const hasServiceValue = serviceValue !== undefined;
  const effectiveValue = hasServiceValue ? serviceValue : sharedValue;
  const required = serviceConfig.required.includes(variableName);
  const validator = whitelist.validators.byVariable[variableName];
  const findings = [];
  const checks = [required ? "required" : "optional"];
  const scope = hasServiceValue
    ? hasSharedValue
      ? "shared+service"
      : "service"
    : hasSharedValue
      ? "shared"
      : "missing";

  if (!hasSharedValue && !hasServiceValue) {
    if (required) {
      findings.push(
        createFinding({
          environment,
          flag: "MISSING",
          message: "Required variable is not set.",
          priority: getFindingPriority({
            environment,
            flag: "MISSING",
            variableName,
            whitelist,
          }),
          serviceName,
          variableName,
        }),
      );
    }
  } else {
    if (hasSharedValue && hasServiceValue) {
      const duplicateType =
        String(sharedValue) === String(serviceValue)
          ? "same value"
          : "service override differs from shared value";

      findings.push(
        createFinding({
          environment,
          flag: "DUPLICATE",
          message: `Variable is set in shared and service scope (${duplicateType}).`,
          priority: getFindingPriority({
            environment,
            flag: "DUPLICATE",
            variableName,
            whitelist,
          }),
          serviceName,
          variableName,
        }),
      );
    }

    if (!String(effectiveValue).trim()) {
      findings.push(
        createFinding({
          environment,
          flag: "INVALID_FORMAT",
          message: "Value is empty.",
          priority: getFindingPriority({
            environment,
            flag: "INVALID_FORMAT",
            variableName,
            whitelist,
          }),
          serviceName,
          variableName,
        }),
      );
    } else {
      const validation = validateVariable({
        effectiveValues,
        environment,
        serviceName,
        validator,
        value: effectiveValue,
        variableName,
      });

      if (validation.error) {
        findings.push(
          createFinding({
            environment,
            flag: "INVALID_FORMAT",
            message: validation.error,
            priority: getFindingPriority({
              environment,
              flag: "INVALID_FORMAT",
              variableName,
              whitelist,
            }),
            serviceName,
            variableName,
          }),
        );
      }

      if (validation.summary) {
        checks.push(validation.summary);
      }
    }
  }

  return {
    checks,
    findings,
    required,
    scope,
    status: findings.length > 0 ? "❌" : "✅",
    summary:
      findings.length > 0
        ? findings.map((finding) => finding.message).join(" ")
        : !hasSharedValue && !hasServiceValue
          ? "Optional variable is unset."
          : `Value is configured via ${scope}.`,
    valueState: summarizeValue({
      validator,
      value: effectiveValue,
      variableName,
      whitelist,
    }),
    variable: variableName,
  };
}

function evaluateExtraVariable({
  environment,
  ownershipIndex,
  serviceName,
  serviceVariables,
  sharedVariables,
  variableName,
  whitelist,
}) {
  const sharedValue = sharedVariables[variableName];
  const serviceValue = serviceVariables[variableName];
  const hasSharedValue = sharedValue !== undefined;
  const hasServiceValue = serviceValue !== undefined;
  const effectiveValue = hasServiceValue ? serviceValue : sharedValue;

  if (effectiveValue === undefined) {
    return null;
  }

  if (matchesAnyPattern(variableName, whitelist.platformManagedPatterns)) {
    return null;
  }

  const findings = [];
  const scope = hasServiceValue
    ? hasSharedValue
      ? "shared+service"
      : "service"
    : "shared";
  const owners = ownershipIndex.get(variableName);
  const isForbiddenByScope = matchesAnyPattern(
    variableName,
    whitelist.forbiddenRailwayPatterns,
  );

  if (hasSharedValue && hasServiceValue) {
    findings.push(
      createFinding({
        environment,
        flag: "DUPLICATE",
        message:
          String(sharedValue) === String(serviceValue)
            ? "Variable is set in shared and service scope with the same value."
            : "Variable is set in shared and service scope with different values.",
        priority: getFindingPriority({
          environment,
          flag: "DUPLICATE",
          variableName,
          whitelist,
        }),
        serviceName,
        variableName,
      }),
    );
  }

  if (!String(effectiveValue).trim()) {
    findings.push(
      createFinding({
        environment,
        flag: "INVALID_FORMAT",
        message: "Value is empty.",
        priority: getFindingPriority({
          environment,
          flag: "INVALID_FORMAT",
          variableName,
          whitelist,
        }),
        serviceName,
        variableName,
      }),
    );
  }

  if (isForbiddenByScope) {
    findings.push(
      createFinding({
        environment,
        flag: "WRONG_SCOPE",
        message: "Variable is Vercel-only and must not be set on Railway.",
        priority: getFindingPriority({
          environment,
          flag: "WRONG_SCOPE",
          variableName,
          whitelist,
        }),
        serviceName,
        variableName,
      }),
    );
  } else if (owners && !owners.has(serviceName)) {
    findings.push(
      createFinding({
        environment,
        flag: "WRONG_SERVICE",
        message: `Variable belongs to ${Array.from(owners).sort().join(", ")}.`,
        priority: getFindingPriority({
          environment,
          flag: "WRONG_SERVICE",
          variableName,
          whitelist,
        }),
        serviceName,
        variableName,
      }),
    );
  }

  if (
    isSecretVariable(variableName, whitelist) &&
    findings.some((finding) =>
      ["WRONG_SCOPE", "WRONG_SERVICE"].includes(finding.flag),
    )
  ) {
    findings.push(
      createFinding({
        environment,
        flag: "DANGEROUS_EXPOSURE",
        message: "Secret is exposed on a service that should not own it.",
        priority: getFindingPriority({
          environment,
          flag: "DANGEROUS_EXPOSURE",
          variableName,
          whitelist,
        }),
        serviceName,
        variableName,
      }),
    );
  }

  if (findings.length === 0) {
    return {
      infoOnly: true,
      scope,
      valueState: summarizeValue({
        validator: whitelist.validators.byVariable[variableName],
        value: effectiveValue,
        variableName,
        whitelist,
      }),
      variable: variableName,
    };
  }

  return {
    checks: ["extra"],
    findings,
    required: false,
    scope,
    status: "❌",
    summary: findings.map((finding) => finding.message).join(" "),
    valueState: summarizeValue({
      validator: whitelist.validators.byVariable[variableName],
      value: effectiveValue,
      variableName,
      whitelist,
    }),
    variable: variableName,
  };
}

function createNetworkRow({
  environment,
  serviceConfig,
  serviceDomains,
  servicePublicUrl,
  serviceName,
  whitelist,
}) {
  const publicDomains = Array.isArray(serviceDomains)
    ? [...serviceDomains]
    : [];
  const fallbackPublicUrl =
    typeof servicePublicUrl === "string" ? servicePublicUrl.trim() : "";

  if (publicDomains.length === 0 && fallbackPublicUrl) {
    publicDomains.push(fallbackPublicUrl);
  }

  const expectsPublicDomain = serviceConfig.publicNetworking === "required";
  const expectsPrivateOnly = serviceConfig.publicNetworking === "disabled";
  const findings = [];

  if (expectsPublicDomain && publicDomains.length === 0) {
    findings.push(
      createFinding({
        environment,
        flag: "INVALID_FORMAT",
        message:
          "Public networking is required but no public domain is configured.",
        priority: getFindingPriority({
          environment,
          flag: "INVALID_FORMAT",
          variableName: "PUBLIC_NETWORKING",
          whitelist,
        }),
        serviceName,
        variableName: "PUBLIC_NETWORKING",
      }),
    );
  }

  if (expectsPrivateOnly && publicDomains.length > 0) {
    findings.push(
      createFinding({
        environment,
        flag: "DANGEROUS_EXPOSURE",
        message: `Public networking must stay disabled, found ${publicDomains.join(
          ", ",
        )}.`,
        priority: getFindingPriority({
          environment,
          flag: "DANGEROUS_EXPOSURE",
          variableName: "PUBLIC_NETWORKING",
          whitelist,
        }),
        serviceName,
        variableName: "PUBLIC_NETWORKING",
      }),
    );
  }

  return {
    checks: ["networking"],
    findings,
    required: false,
    scope: "service",
    status: findings.length > 0 ? "❌" : "✅",
    summary:
      findings.length > 0
        ? findings.map((finding) => finding.message).join(" ")
        : expectsPublicDomain
          ? "Public networking is enabled as expected."
          : "Service remains private as expected.",
    valueState: publicDomains.length > 0 ? publicDomains.join(", ") : "private",
    variable: "PUBLIC_NETWORKING",
  };
}

function createInventoryRow({
  environment,
  environmentConfig,
  serviceList,
  serviceName,
  whitelist,
}) {
  const present = hasServiceInventoryEntry({
    environmentConfig,
    serviceList,
    serviceName,
  });

  if (present) {
    return {
      checks: ["inventory"],
      findings: [],
      required: false,
      scope: "service",
      status: "✅",
      summary: "Service is present in the Railway inventory.",
      valueState: "present",
      variable: "SERVICE_INVENTORY",
    };
  }

  return {
    checks: ["inventory"],
    findings: [
      createFinding({
        environment,
        flag: "MISSING",
        message: "Service is missing from the Railway environment inventory.",
        priority: getFindingPriority({
          environment,
          flag: "MISSING",
          variableName: "SERVICE_INVENTORY",
          whitelist,
        }),
        serviceName,
        variableName: "SERVICE_INVENTORY",
      }),
    ],
    required: false,
    scope: "service",
    status: "❌",
    summary: "Service is missing from the Railway environment inventory.",
    valueState: "missing",
    variable: "SERVICE_INVENTORY",
  };
}

function buildEffectiveValues(sharedVariables, serviceVariables) {
  return {
    ...sharedVariables,
    ...serviceVariables,
  };
}

function buildRedisConsistency({ rawEnvironment, whitelist }) {
  const sharedVariables = parseVariablePayload(rawEnvironment.sharedVariables);
  const entries = [];

  for (const [serviceName, serviceConfig] of Object.entries(
    whitelist.services,
  )) {
    const managesRedis =
      serviceConfig.required.includes("REDIS_URL") ||
      serviceConfig.optional.includes("REDIS_URL");

    if (!managesRedis) {
      continue;
    }

    const serviceVariables = parseVariablePayload(
      rawEnvironment.serviceVariables?.[serviceName],
    );
    const effectiveValue =
      serviceVariables.REDIS_URL ?? sharedVariables.REDIS_URL;

    entries.push({
      service: serviceName,
      value: effectiveValue,
      valueState: effectiveValue ? redactUrl(effectiveValue) : "missing",
    });
  }

  const distinctValues = new Set(
    entries
      .map((entry) => entry.value)
      .filter((value) => typeof value === "string" && value.trim().length > 0),
  );

  if (distinctValues.size <= 1) {
    return {
      entries,
      message:
        entries.length > 0
          ? "REDIS_URL is consistent across all Redis-using services."
          : "No Redis-using services were audited.",
      ok: true,
    };
  }

  return {
    entries,
    message:
      "REDIS_URL differs across Redis-using services in the same environment.",
    ok: false,
  };
}

function coerceHealthChecks(healthChecks, validateHealthPayload) {
  return (healthChecks ?? []).map((check) => {
    if (check.ok && check.bodyText && !check.payload) {
      try {
        return {
          ...check,
          payload: validateHealthPayload({
            endpoint: check.target ?? check.name,
            expectedService: check.expectedService,
            text: check.bodyText,
          }),
          payloadOk: true,
        };
      } catch (error) {
        return {
          ...check,
          message: error.message,
          ok: false,
          payloadOk: false,
        };
      }
    }

    return check;
  });
}

function auditEnvironment({
  environment,
  rawEnvironment,
  validateHealthPayload,
  whitelist,
}) {
  const ownershipIndex = buildOwnershipIndex(whitelist);
  const services = {};
  const prioritizedFixes = [];
  const environmentConfig = parseEnvironmentConfigPayload(
    rawEnvironment.environmentConfig ?? {},
  );
  const healthChecks = coerceHealthChecks(
    rawEnvironment.healthChecks,
    validateHealthPayload,
  );
  const redisConsistency = buildRedisConsistency({
    rawEnvironment,
    whitelist,
  });

  for (const [serviceName, serviceConfig] of Object.entries(
    whitelist.services,
  )) {
    const sharedVariables = parseVariablePayload(
      rawEnvironment.sharedVariables,
    );
    const serviceVariables = parseVariablePayload(
      rawEnvironment.serviceVariables?.[serviceName],
    );
    const listedService = getServiceListEntry(
      rawEnvironment.serviceList,
      serviceName,
    );
    const environmentServiceConfig = getConfiguredService(
      environmentConfig,
      serviceName,
      listedService?.id,
    );
    const serviceInventoryRow = createInventoryRow({
      environment,
      environmentConfig,
      serviceList: rawEnvironment.serviceList,
      serviceName,
      whitelist,
    });
    const serviceAvailable = serviceInventoryRow.status === "✅";
    const effectiveValues = buildEffectiveValues(
      sharedVariables,
      serviceVariables,
    );
    const managedVariables = new Set([
      ...serviceConfig.required,
      ...serviceConfig.optional,
    ]);
    const rows = [];
    const infoExtras = [];

    rows.push(serviceInventoryRow);
    prioritizedFixes.push(...serviceInventoryRow.findings);

    for (const variableName of [
      ...serviceConfig.required,
      ...serviceConfig.optional,
    ]) {
      const row = evaluateManagedVariable({
        effectiveValues,
        environment,
        serviceConfig,
        serviceName,
        serviceVariables,
        sharedVariables,
        variableName,
        whitelist,
      });

      rows.push(row);
      prioritizedFixes.push(...row.findings);
    }

    for (const variableName of Object.keys(effectiveValues).sort()) {
      if (managedVariables.has(variableName)) {
        continue;
      }

      const row = evaluateExtraVariable({
        environment,
        ownershipIndex,
        serviceName,
        serviceVariables,
        sharedVariables,
        variableName,
        whitelist,
      });

      if (!row) {
        continue;
      }

      if (row.infoOnly) {
        infoExtras.push({
          scope: row.scope,
          valueState: row.valueState,
          variable: row.variable,
        });
        continue;
      }

      rows.push(row);
      prioritizedFixes.push(...row.findings);
    }

    const serviceHealthChecks = serviceAvailable
      ? healthChecks.filter(
          (check) =>
            check.category === "health" && check.service === serviceName,
        )
      : [];

    if (serviceAvailable) {
      const networkingRow = createNetworkRow({
        environment,
        serviceConfig,
        serviceDomains: environmentServiceConfig?.networking?.serviceDomains,
        servicePublicUrl: getServicePublicUrl(
          rawEnvironment.serviceList,
          serviceName,
        ),
        serviceName,
        whitelist,
      });

      rows.push(networkingRow);
      prioritizedFixes.push(...networkingRow.findings);
    }

    for (const check of serviceHealthChecks) {
      if (!check.ok && !check.unverified) {
        prioritizedFixes.push(
          createFinding({
            environment,
            flag: "HEALTHCHECK_FAILED",
            message:
              check.message ??
              `${check.name} failed${check.httpStatus ? ` with HTTP ${check.httpStatus}` : "."}`,
            priority: getFindingPriority({
              environment,
              flag: "HEALTHCHECK_FAILED",
              variableName: check.name,
              whitelist,
            }),
            serviceName,
            variableName: check.name,
          }),
        );
      }
    }

    services[serviceName] = {
      healthChecks: serviceHealthChecks,
      infoExtras,
      networking: {
        privateNetworkEndpoint:
          environmentServiceConfig?.networking?.privateNetworkEndpoint ?? null,
        publicDomains:
          environmentServiceConfig?.networking?.serviceDomains ?? [],
      },
      variables: rows.sort((left, right) =>
        left.variable.localeCompare(right.variable),
      ),
    };
  }

  const redisChecks = healthChecks.filter(
    (check) => check.category === "redis",
  );

  if (!redisConsistency.ok) {
    prioritizedFixes.push(
      createFinding({
        environment,
        flag: "INVALID_FORMAT",
        message: redisConsistency.message,
        priority: getFindingPriority({
          environment,
          flag: "INVALID_FORMAT",
          variableName: "REDIS_URL_CONSISTENCY",
          whitelist,
        }),
        serviceName: "environment",
        variableName: "REDIS_URL_CONSISTENCY",
      }),
    );
  }

  for (const redisCheck of redisChecks) {
    if (!redisCheck.ok && !redisCheck.unverified) {
      prioritizedFixes.push(
        createFinding({
          environment,
          flag: "HEALTHCHECK_FAILED",
          message: redisCheck.message ?? "Redis reachability check failed.",
          priority: getFindingPriority({
            environment,
            flag: "HEALTHCHECK_FAILED",
            variableName: "REDIS_URL_REACHABILITY",
            whitelist,
          }),
          serviceName: redisCheck.service,
          variableName: "REDIS_URL_REACHABILITY",
        }),
      );
    }
  }

  return {
    environment,
    healthChecks,
    prioritizedFixes,
    redisChecks,
    redisConsistency,
    services,
  };
}

function summarizeRowForDrift(row) {
  if (!row) {
    return "missing";
  }

  return `${row.status}|${row.scope}|${row.findings
    .map((finding) => finding.flag)
    .sort()
    .join(",")}`;
}

function buildStagingDrift(reportByEnvironment, whitelist) {
  const stagingReport = reportByEnvironment.staging;
  const productionReport = reportByEnvironment.production;

  if (!stagingReport || !productionReport) {
    return [];
  }

  const drift = [];

  for (const serviceName of Object.keys(whitelist.services)) {
    const rowNames = new Set([
      ...stagingReport.services[serviceName].variables.map(
        (row) => row.variable,
      ),
      ...productionReport.services[serviceName].variables.map(
        (row) => row.variable,
      ),
    ]);

    for (const variableName of Array.from(rowNames).sort()) {
      const stagingRow = stagingReport.services[serviceName].variables.find(
        (row) => row.variable === variableName,
      );
      const productionRow = productionReport.services[
        serviceName
      ].variables.find((row) => row.variable === variableName);

      const stagingSignature = summarizeRowForDrift(stagingRow);
      const productionSignature = summarizeRowForDrift(productionRow);

      if (stagingSignature === productionSignature) {
        continue;
      }

      drift.push({
        environment: "cross-environment",
        flag: "STAGING_DRIFT",
        message: `${serviceName}.${variableName} differs between staging and production.`,
        note: `staging=${stagingSignature}; production=${productionSignature}`,
        priority: getFindingPriority({
          environment: "production",
          flag: "STAGING_DRIFT",
          variableName,
          whitelist,
        }),
        production: productionSignature,
        service: serviceName,
        staging: stagingSignature,
        variable: variableName,
      });
    }
  }

  return drift;
}

function countPriorities(findings) {
  return findings.reduce(
    (summary, finding) => {
      summary[finding.priority] = (summary[finding.priority] ?? 0) + 1;
      return summary;
    },
    { CRITICAL: 0, HIGH: 0, LOW: 0 },
  );
}

function buildAuditReport({
  generatedAt = new Date().toISOString(),
  project,
  rawEnvironments,
  validateHealthPayload,
  whitelist,
}) {
  const environments = {};

  for (const environmentName of Object.keys(rawEnvironments)) {
    environments[environmentName] = auditEnvironment({
      environment: environmentName,
      rawEnvironment: rawEnvironments[environmentName],
      validateHealthPayload,
      whitelist,
    });
  }

  const stagingDrift = buildStagingDrift(environments, whitelist);
  const allFindings = [
    ...Object.values(environments).flatMap(
      (environmentReport) => environmentReport.prioritizedFixes,
    ),
    ...stagingDrift,
  ];

  return {
    environments,
    generatedAt,
    project,
    stagingDrift,
    summary: {
      findingsByPriority: countPriorities(allFindings),
      totalFindings: allFindings.length,
    },
  };
}

function groupFindingsByPriority(findings) {
  return {
    CRITICAL: findings.filter((finding) => finding.priority === "CRITICAL"),
    HIGH: findings.filter((finding) => finding.priority === "HIGH"),
    LOW: findings.filter((finding) => finding.priority === "LOW"),
  };
}

function formatHealthStatus(check) {
  if (check.unverified) {
    return "unverified";
  }

  if (check.ok) {
    return "200 / payload ok";
  }

  if (check.httpStatus) {
    return `${check.httpStatus} / failed`;
  }

  return "failed";
}

function formatMarkdownReport(report) {
  const lines = [
    "# StreamOS Railway Env Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Project: ${report.project.name} (${report.project.id})`,
    "",
  ];

  for (const environmentName of Object.keys(report.environments).sort()) {
    const environmentReport = report.environments[environmentName];
    const groupedFindings = groupFindingsByPriority(
      environmentReport.prioritizedFixes,
    );

    lines.push(`## ${environmentName}`);
    lines.push("");

    for (const serviceName of Object.keys(environmentReport.services).sort()) {
      const serviceReport = environmentReport.services[serviceName];

      lines.push(`### ${serviceName}`);
      lines.push("");
      lines.push("| Variable | Scope | Status | Checks | Summary |");
      lines.push("| --- | --- | --- | --- | --- |");

      for (const row of serviceReport.variables) {
        lines.push(
          `| ${row.variable} | ${row.scope} | ${row.status} | ${row.checks.join(
            "; ",
          )} | ${row.summary} |`,
        );
      }

      lines.push("");

      if (serviceReport.infoExtras.length > 0) {
        lines.push("Info extras:");
        for (const extra of serviceReport.infoExtras) {
          lines.push(
            `- ${extra.variable} (${extra.scope}): ${extra.valueState}`,
          );
        }
        lines.push("");
      }

      if (serviceReport.healthChecks.length > 0) {
        lines.push("| Health Check | Method | Target | Status | Summary |");
        lines.push("| --- | --- | --- | --- | --- |");

        for (const check of serviceReport.healthChecks) {
          lines.push(
            `| ${check.name} | ${check.method} | ${check.target} | ${formatHealthStatus(
              check,
            )} | ${check.message ?? "OK"} |`,
          );
        }

        lines.push("");
      }
    }

    if (environmentReport.redisChecks.length > 0) {
      lines.push("### Redis");
      lines.push("");
      lines.push("| Check | Target | Status | Summary |");
      lines.push("| --- | --- | --- | --- |");
      lines.push(
        `| consistency | all Redis services | ${
          environmentReport.redisConsistency.ok ? "✅" : "❌"
        } | ${environmentReport.redisConsistency.message} |`,
      );

      for (const check of environmentReport.redisChecks) {
        lines.push(
          `| ${check.name} | ${check.target} | ${check.ok ? "✅" : "❌"} | ${
            check.message ?? "OK"
          } |`,
        );
      }

      lines.push("");
    }

    lines.push("### Prioritized Fixes");
    lines.push("");

    for (const priority of ["CRITICAL", "HIGH", "LOW"]) {
      lines.push(`#### ${priority}`);
      const items = groupedFindings[priority];

      if (items.length === 0) {
        lines.push("- none");
      } else {
        for (const finding of items) {
          lines.push(
            `- [${finding.service}] ${finding.variable}: ${finding.message}`,
          );
        }
      }

      lines.push("");
    }
  }

  lines.push("## STAGING_DRIFT");
  lines.push("");
  lines.push("| Service | Variable | Staging | Production | Note |");
  lines.push("| --- | --- | --- | --- | --- |");

  for (const drift of report.stagingDrift) {
    lines.push(
      `| ${drift.service} | ${drift.variable} | ${drift.staging} | ${drift.production} | ${drift.note} |`,
    );
  }

  if (report.stagingDrift.length === 0) {
    lines.push("| none | none | none | none | none |");
  }

  return `${lines.join("\n")}\n`;
}

function hasBlockingFindings(report) {
  return (
    report.summary.totalFindings > 0 ||
    Object.values(report.environments).some((environmentReport) =>
      environmentReport.healthChecks.some(
        (check) => !check.ok && !check.unverified,
      ),
    )
  );
}

module.exports = {
  buildAuditReport,
  buildOwnershipIndex,
  formatMarkdownReport,
  getServicePublicUrl,
  hasServiceInventoryEntry,
  hasBlockingFindings,
  parseEnvironmentConfigPayload,
  parseServiceListPayload,
  parseVariablePayload,
  path,
};
