"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ApiGatewayConfigurationError,
  callApiGatewayJson,
} from "@/lib/api-gateway";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import {
  repurposingReviewFormSchema,
  type RepurposingReviewFormValues,
} from "./review";

export async function submitRepurposingReviewAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/jobs/repurposing?error=supabase-not-configured");
  }

  const parsedValues = parseRepurposingReviewFormData(formData);

  if (!parsedValues) {
    redirect("/dashboard/jobs/repurposing?error=invalid-review-payload");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const result = await requestRepurposingReview({
    input: parsedValues,
    userId: userData.user.id,
  });

  if (!result.ok) {
    let error = "review-update-failed";

    if (result.status === 400) {
      error = "invalid-review-status";
    } else if (result.status === 404) {
      error = "review-job-not-found";
    }

    redirect(
      `/dashboard/jobs/repurposing?error=${error}&jobId=${parsedValues.jobId}`,
    );
  }

  revalidatePath("/dashboard/jobs/repurposing");
  revalidatePath("/dashboard/jobs");
  redirect(
    `/dashboard/jobs/repurposing?status=review-saved&jobId=${parsedValues.jobId}`,
  );
}

function parseRepurposingReviewFormData(
  formData: FormData,
): RepurposingReviewFormValues | null {
  const parsed = repurposingReviewFormSchema.safeParse({
    jobId: String(formData.get("jobId") ?? "").trim(),
    reviewStatus: String(formData.get("reviewStatus") ?? "").trim(),
    reviewerNotes: String(formData.get("reviewerNotes") ?? "").trim(),
  });

  return parsed.success ? parsed.data : null;
}

async function requestRepurposingReview({
  input,
  userId,
}: {
  input: RepurposingReviewFormValues;
  userId: string;
}) {
  try {
    return await callApiGatewayJson<{
      job_id: string;
      reviewed_at: string;
      review_status: string;
      status: "review_saved";
    }>({
      body: {
        job_id: input.jobId,
        reviewer_notes: input.reviewerNotes,
        review_status: input.reviewStatus,
        user_id: userId,
      },
      path: "/api/content-jobs/review",
    });
  } catch (error) {
    if (error instanceof ApiGatewayConfigurationError) {
      return {
        data: null,
        error: error.message,
        ok: false as const,
        status: 503,
      };
    }

    return {
      data: null,
      error: error instanceof Error ? error.message : "Review request failed.",
      ok: false as const,
      status: 502,
    };
  }
}
