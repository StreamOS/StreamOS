import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";

const API_SECRET = "test-api-gateway-secret-123";
const SUPABASE_URL = "https://supabase.streamos.test";
const SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";

const ORIGINAL_ENV = {
  API_GATEWAY_SECRET: process.env.API_GATEWAY_SECRET,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
};

describe("content jobs router", () => {
  afterEach(() => {
    restoreEnvValue("API_GATEWAY_SECRET", ORIGINAL_ENV.API_GATEWAY_SECRET);
    restoreEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      ORIGINAL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    );
    restoreEnvValue("SUPABASE_URL", ORIGINAL_ENV.SUPABASE_URL);
  });

  it("saves a repurposing review decision through the gateway and RPC contract", async () => {
    const requests: Array<{
      body: string | null;
      method: string;
      url: string;
    }> = [];

    process.env.API_GATEWAY_SECRET = API_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = SUPABASE_URL;

    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async (input, init) => {
          const requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          const method = init?.method ?? "GET";
          const body = typeof init?.body === "string" ? init.body : null;
          requests.push({ body, method, url: requestUrl });

          if (requestUrl.includes("/rest/v1/content_jobs")) {
            return jsonResponse([
              {
                id: JOB_ID,
                review_status: "needs_review",
                reviewer_notes: "",
                user_id: USER_ID,
              },
            ]);
          }

          if (requestUrl.includes("/rest/v1/rpc/record_content_job_review")) {
            return jsonResponse({
              id: JOB_ID,
              review_status: "approved",
              reviewed_at: "2026-06-19T11:11:12.000Z",
            });
          }

          return new Response("not found", { status: 404 });
        },
      },
    });
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/content-jobs/review`,
        {
          body: JSON.stringify({
            job_id: JOB_ID,
            review_status: "approved",
            reviewer_notes: "Looks ready.",
            user_id: USER_ID,
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toEqual({
        job_id: JOB_ID,
        reviewed_at: "2026-06-19T11:11:12.000Z",
        review_status: "approved",
        status: "review_saved",
      });
      expect(requests).toHaveLength(2);
      expect(requests[0]?.url).toContain("/rest/v1/content_jobs");
      expect(requests[1]?.url).toContain(
        "/rest/v1/rpc/record_content_job_review",
      );
      const rpcBody = JSON.parse(requests[1]?.body ?? "{}");

      expect(rpcBody).toMatchObject({
        p_content_job_id: JOB_ID,
        p_reviewer_notes: "Looks ready.",
        p_review_status: "approved",
        p_reviewed_by: USER_ID,
        p_user_id: USER_ID,
      });
      expect(typeof rpcBody.p_reviewed_at).toBe("string");
      expect(rpcBody.p_reviewed_at).toContain("T");
    } finally {
      server.close();
    }
  });

  it("rejects malformed repurposing review payloads", async () => {
    process.env.API_GATEWAY_SECRET = API_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = SUPABASE_URL;

    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
    });
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/content-jobs/review`,
        {
          body: JSON.stringify({
            job_id: JOB_ID,
            reviewer_notes: "Looks ready.",
            user_id: USER_ID,
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe("invalid_repurposing_review_payload");
    } finally {
      server.close();
    }
  });

  it("returns not found when the review target does not belong to the user", async () => {
    process.env.API_GATEWAY_SECRET = API_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = SUPABASE_URL;

    const app = createApp({
      apiGatewaySecret: API_SECRET,
      nodeEnv: "test",
      oauth: {
        fetchImpl: async (input, init) => {
          const requestUrl =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          const method = init?.method ?? "GET";

          if (
            requestUrl.includes("/rest/v1/content_jobs") &&
            method === "GET"
          ) {
            return jsonResponse([]);
          }

          return new Response("not found", { status: 404 });
        },
      },
    });
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/content-jobs/review`,
        {
          body: JSON.stringify({
            job_id: JOB_ID,
            review_status: "approved",
            reviewer_notes: "Looks ready.",
            user_id: USER_ID,
          }),
          headers: {
            Authorization: `Bearer ${API_SECRET}`,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      const payload = await response.json();

      expect(response.status).toBe(404);
      expect(payload.error).toBe("content_job_not_found");
    } finally {
      server.close();
    }
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status: 200,
  });
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
