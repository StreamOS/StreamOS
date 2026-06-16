const { isIP } = require("node:net");

const DEFAULT_AUTOMATION_SERVICE_NAME = "automation-service";

function isPrivateIpAddress(hostname) {
  if (typeof hostname !== "string" || isIP(hostname) === 0) {
    return false;
  }

  if (hostname === "::1" || hostname === "127.0.0.1") {
    return true;
  }

  const octets = hostname.split(".").map(Number);

  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
    return false;
  }

  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function isPrivateAutomationHostname(
  hostname,
  { expectedServiceName = DEFAULT_AUTOMATION_SERVICE_NAME } = {},
) {
  const normalizedHostname = String(hostname || "")
    .trim()
    .toLowerCase();
  const normalizedServiceName = expectedServiceName.trim().toLowerCase();

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === normalizedServiceName ||
    normalizedHostname.endsWith(".railway.internal") ||
    normalizedHostname.endsWith(".internal") ||
    isPrivateIpAddress(normalizedHostname)
  );
}

function parseAutomationServiceUrl(
  value,
  {
    consumerName,
    expectedServiceName = DEFAULT_AUTOMATION_SERVICE_NAME,
    variableName = "AUTOMATION_SERVICE_URL",
  } = {},
) {
  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    throw new Error(
      `${variableName} is required${
        consumerName ? ` for ${consumerName}` : ""
      }.`,
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(trimmedValue);
  } catch (error) {
    throw new Error(`${variableName} must be a valid absolute URL.`, {
      cause: error,
    });
  }

  if (parsedUrl.protocol !== "http:") {
    throw new Error(
      `${variableName} must use http private networking, got ${parsedUrl.protocol}.`,
    );
  }

  if (
    !isPrivateAutomationHostname(parsedUrl.hostname, { expectedServiceName })
  ) {
    throw new Error(
      `${variableName} must use private networking for ${
        consumerName || "this service"
      }, got ${parsedUrl.hostname}.`,
    );
  }

  return parsedUrl;
}

function isPrivateAutomationUrl(value, options) {
  try {
    const parsedUrl =
      value instanceof URL ? value : parseAutomationServiceUrl(value, options);

    return isPrivateAutomationHostname(parsedUrl.hostname, options);
  } catch {
    return false;
  }
}

function assertPrivateAutomationServiceUrl(value, options) {
  const parsedUrl = parseAutomationServiceUrl(value, options);
  return parsedUrl.toString().replace(/\/$/, "");
}

module.exports = {
  DEFAULT_AUTOMATION_SERVICE_NAME,
  assertPrivateAutomationServiceUrl,
  isPrivateAutomationHostname,
  isPrivateAutomationUrl,
  isPrivateIpAddress,
  parseAutomationServiceUrl,
};
