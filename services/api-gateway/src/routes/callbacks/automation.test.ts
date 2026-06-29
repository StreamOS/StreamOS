import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const TENANT_ID = "tenant-123";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const ORIGINAL_ENV = {
  API_GATEWAY_SECRET: process.env.API_GATEWAY_SECRET,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
};

describe("automation trusted context route", () => {
  afterEach(() => {
    restoreEnvValue("API_GATEWAY_SECRET", ORIGINAL_ENV.API_GATEWAY_SECRET);
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("rejects requests without the internal gateway secret", async () => {
    process.env.API_GATEWAY_SECRET = API_SECRET;

    let fetchCalls = 0;
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("unexpected", { status: 500 });
        },
      },
    });
    const server = app.listen(0);

    try {
      const response = await postTrustedContext(server, {
        body: {
          sources: ["channel_platform_status"],
          tenant_id: TENANT_ID,
          user_id: USER_ID,
        },
        secret: "wrong-secret",
      });
      const payload = await response.json();

      expect(response.status).toBe(401);
      expect(payload).toEqual({
        error: "invalid_api_gateway_secret",
        message: "Automation callback secret is invalid.",
      });
      expect(fetchCalls).toBe(0);
    } finally {
      server.close();
    }
  });

  it("rejects invalid trusted context payloads before Supabase reads", async () => {
    process.env.API_GATEWAY_SECRET = API_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = SUPABASE_URL;

    let fetchCalls = 0;
    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async () => {
          fetchCalls += 1;
          return new Response("unexpected", { status: 500 });
        },
      },
    });
    const server = app.listen(0);

    try {
      const response = await postTrustedContext(server, {
        body: {
          sources: ["channel_platform_status", "channel_platform_status"],
          tenant_id: "",
          user_id: "not-a-uuid",
        },
      });
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe("invalid_trusted_context_read_payload");
      expect(fetchCalls).toBe(0);
    } finally {
      server.close();
    }
  });

  it("returns a secret-safe failure when the trusted read cannot be loaded", async () => {
    process.env.API_GATEWAY_SECRET = API_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = SUPABASE_URL;

    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async () => {
          throw new Error(
            "https://private.example.com?token=sk-private should never reach the response",
          );
        },
      },
    });
    const server = app.listen(0);

    try {
      const response = await postTrustedContext(server, {
        body: {
          sources: ["content_job_summary"],
          tenant_id: TENANT_ID,
          user_id: USER_ID,
        },
      });
      const payload = await response.json();

      expect(response.status).toBe(502);
      expect(payload).toEqual({
        error: "trusted_context_read_failed",
        message: "Trusted AI context could not be loaded.",
      });
      expect(JSON.stringify(payload)).not.toContain("private.example.com");
      expect(JSON.stringify(payload)).not.toContain("sk-private");
      expect(JSON.stringify(payload)).not.toContain("https://");
    } finally {
      server.close();
    }
  });
});

async function postTrustedContext(
  server: { address(): unknown },
  {
    body,
    secret = API_SECRET,
  }: {
    body: Record<string, unknown>;
    secret?: string;
  },
): Promise<Response> {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected TCP server address.");
  }

  return fetch(
    `http://127.0.0.1:${address.port}/api/callbacks/automation/trusted-context`,
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "x-streamos-api-secret": secret,
      },
      method: "POST",
    },
  );
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
