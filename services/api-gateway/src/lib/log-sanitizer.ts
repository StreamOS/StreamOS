const MAX_SAFE_MESSAGE_LENGTH = 220;
const TOKEN_LIKE_TEXT_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]+\b/g,
  /\bgh[opsu]_[A-Za-z0-9_-]+\b/g,
  /\bbearer\s+[A-Za-z0-9._-]+/gi,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];
const SECRET_ASSIGNMENT_PATTERN =
  /\b(access[_-]?token|refresh[_-]?token|verify[_-]?token|token|secret|password|apikey|api[_-]?key|signature)\s*[=:]\s*[^&\s,}]+/gi;

export type SanitizedErrorLog = {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
  statusCode?: number;
};

export type SanitizedUrlLog = {
  host: string;
  pathname: string;
  protocol: string;
};

export function sanitizeErrorForLog(error: unknown): SanitizedErrorLog {
  if (!(error instanceof Error)) {
    return {
      message: sanitizeLogText(String(error)),
      name: "NonError",
    };
  }

  const maybeError = error as Error & {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const sanitized: SanitizedErrorLog = {
    name: sanitizeLogText(error.name || "Error"),
  };
  const code = sanitizeOptionalString(maybeError.code);
  const status = sanitizeOptionalNumber(maybeError.status);
  const statusCode = sanitizeOptionalNumber(maybeError.statusCode);
  const message = sanitizeOptionalString(error.message);

  if (code) {
    sanitized.code = code;
  }

  if (status !== undefined) {
    sanitized.status = status;
  }

  if (statusCode !== undefined) {
    sanitized.statusCode = statusCode;
  }

  if (message) {
    sanitized.message = message;
  }

  return sanitized;
}

export function sanitizeUrlForLog(value: string): SanitizedUrlLog | string {
  try {
    const url = new URL(value);

    return {
      host: sanitizeLogText(url.host),
      pathname: sanitizeLogText(url.pathname || "/"),
      protocol: sanitizeLogText(url.protocol),
    };
  } catch {
    return "[invalid-url]";
  }
}

export function sanitizeLogMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sanitizeLogValue(key, value),
    ]),
  );
}

export function sanitizeLogText(value: string): string {
  let sanitized = value
    .replace(/https?:\/\/[^\s,}]+/gi, "[redacted-url]")
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, label: string) => {
      return `${label}=[redacted]`;
    });

  for (const pattern of TOKEN_LIKE_TEXT_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }

  return sanitized.slice(0, MAX_SAFE_MESSAGE_LENGTH);
}

function sanitizeLogValue(key: string, value: unknown): unknown {
  const normalizedKey = key.toLowerCase();

  if (value instanceof Error) {
    return sanitizeErrorForLog(value);
  }

  if (
    typeof value === "string" &&
    (normalizedKey.includes("url") || normalizedKey.includes("topic"))
  ) {
    return sanitizeUrlForLog(value);
  }

  if (typeof value === "string") {
    return sanitizeLogText(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(key, item));
  }

  if (value && typeof value === "object") {
    return sanitizeLogMetadata(value as Record<string, unknown>);
  }

  return value;
}

function sanitizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }

  const sanitized = sanitizeLogText(String(value));

  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
