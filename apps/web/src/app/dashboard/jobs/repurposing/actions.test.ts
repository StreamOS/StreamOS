import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callApiGatewayJson: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/api-gateway", () => ({
  ApiGatewayConfigurationError: class ApiGatewayConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ApiGatewayConfigurationError";
    }
  },
  callApiGatewayJson: mocks.callApiGatewayJson,
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { submitRepurposingReviewAction } from "./actions";

describe("submitRepurposingReviewAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a review decision through the gateway and revalidates the page", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: mocks.getUser,
      },
    });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
      error: null,
    });
    mocks.callApiGatewayJson.mockResolvedValue({
      data: {
        job_id: "22222222-2222-4222-8222-222222222222",
        reviewed_at: "2026-06-19T11:11:12.000Z",
        review_status: "approved",
        status: "review_saved",
      },
      ok: true,
      status: 200,
    });

    const formData = new FormData();
    formData.set("jobId", "22222222-2222-4222-8222-222222222222");
    formData.set("reviewStatus", "approved");
    formData.set("reviewerNotes", "Ship it.");

    await expect(submitRepurposingReviewAction(formData)).rejects.toThrowError(
      "REDIRECT:/dashboard/jobs/repurposing?status=review-saved&jobId=22222222-2222-4222-8222-222222222222",
    );

    expect(mocks.callApiGatewayJson).toHaveBeenCalledWith({
      body: {
        job_id: "22222222-2222-4222-8222-222222222222",
        reviewer_notes: "Ship it.",
        review_status: "approved",
        user_id: "11111111-1111-4111-8111-111111111111",
      },
      path: "/api/content-jobs/review",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/jobs/repurposing",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/jobs");
  });

  it("rejects malformed form data before calling the gateway", async () => {
    const formData = new FormData();
    formData.set("reviewStatus", "approved");

    await expect(submitRepurposingReviewAction(formData)).rejects.toThrowError(
      "REDIRECT:/dashboard/jobs/repurposing?error=invalid-review-payload",
    );

    expect(mocks.callApiGatewayJson).not.toHaveBeenCalled();
  });

  it("redirects to the login page when the session is missing", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: mocks.getUser,
      },
    });
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const formData = new FormData();
    formData.set("jobId", "22222222-2222-4222-8222-222222222222");
    formData.set("reviewStatus", "approved");

    await expect(submitRepurposingReviewAction(formData)).rejects.toThrowError(
      "REDIRECT:/login",
    );
  });
});
