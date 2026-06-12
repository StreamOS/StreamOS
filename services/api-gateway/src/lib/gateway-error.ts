export type GatewayErrorOptions = {
  code: string;
  message: string;
  provider?: string;
  retryAfterSeconds?: number;
  retryable: boolean;
  statusCode: number;
};

export class GatewayError extends Error {
  readonly code: string;
  readonly provider?: string;
  readonly retryAfterSeconds?: number;
  readonly retryable: boolean;
  readonly statusCode: number;

  constructor(options: GatewayErrorOptions) {
    super(options.message);
    this.name = "GatewayError";
    this.code = options.code;
    this.provider = options.provider;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
  }
}

export function isGatewayError(value: unknown): value is GatewayError {
  return value instanceof GatewayError;
}

export function serializeGatewayError(error: GatewayError): {
  error: {
    code: string;
    message: string;
    provider?: string;
    retryable: boolean;
  };
} {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.provider ? { provider: error.provider } : {}),
      retryable: error.retryable,
    },
  };
}
