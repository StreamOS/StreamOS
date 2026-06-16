import "server-only";

export class ApiGatewayConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiGatewayConfigurationError";
  }
}

export type ApiGatewayJsonResult<TPayload> =
  | {
      data: TPayload;
      ok: true;
      status: number;
    }
  | {
      data: unknown;
      error: string;
      ok: false;
      status: number;
    };

export async function callApiGatewayJson<TPayload>({
  body,
  method = "POST",
  path,
}: {
  body?: unknown;
  method?: "GET" | "POST";
  path: string;
}): Promise<ApiGatewayJsonResult<TPayload>> {
  const url = new URL(path, getApiGatewayBaseUrl());
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${getApiGatewaySecret()}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      data,
      error: getGatewayErrorMessage(data, response.status),
      ok: false,
      status: response.status,
    };
  }

  return {
    data: data as TPayload,
    ok: true,
    status: response.status,
  };
}

function getApiGatewayBaseUrl(): string {
  const gatewayUrl = process.env.API_GATEWAY_URL?.trim();

  if (!gatewayUrl) {
    throw new ApiGatewayConfigurationError(
      "API_GATEWAY_URL is not configured.",
    );
  }

  return gatewayUrl.replace(/\/+$/, "");
}

function getApiGatewaySecret(): string {
  const apiGatewaySecret = process.env.API_GATEWAY_SECRET?.trim();

  if (!apiGatewaySecret) {
    throw new ApiGatewayConfigurationError(
      "API_GATEWAY_SECRET is not configured.",
    );
  }

  return apiGatewaySecret;
}

function getGatewayErrorMessage(data: unknown, status: number): string {
  if (isRecord(data)) {
    const message = data.message ?? data.error;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return `API gateway returned ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
