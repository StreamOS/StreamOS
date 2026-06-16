"use server";

import type { Tables } from "@streamos/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ApiGatewayConfigurationError,
  callApiGatewayJson,
} from "@/lib/api-gateway";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function requestContentJobRetryAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/jobs?error=supabase-not-configured");
  }

  const jobId = String(formData.get("jobId") ?? "").trim();

  if (!jobId) {
    redirect("/dashboard/jobs?error=invalid-job");
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  type RetryableJobRow = Pick<
    Tables<"content_jobs">,
    "id" | "max_retries" | "retry_count" | "status"
  >;

  const { data: rawJob, error: jobError } = await supabase
    .from("content_jobs")
    .select("id,status,retry_count,max_retries")
    .eq("id", jobId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (jobError) {
    redirect("/dashboard/jobs?error=retry-load-failed");
  }

  if (!rawJob) {
    redirect("/dashboard/jobs?error=job-not-found");
  }

  const job = rawJob as RetryableJobRow;

  if (job.status !== "failed") {
    redirect("/dashboard/jobs?error=job-not-failed");
  }

  const retryCount = Number(job.retry_count ?? 0);
  const currentMaxRetries = Number(job.max_retries ?? 3);
  const result = await requestGatewayRetry({
    currentMaxRetries,
    jobId: job.id,
    retryCount,
    userId: userData.user.id,
  });

  if (!result) {
    redirect("/dashboard/jobs?error=retry-update-failed");
  }

  revalidatePath("/dashboard/jobs");
  redirect("/dashboard/jobs?status=retry-requested");
}

async function requestGatewayRetry({
  currentMaxRetries,
  jobId,
  retryCount,
  userId,
}: {
  currentMaxRetries: number;
  jobId: string;
  retryCount: number;
  userId: string;
}): Promise<boolean> {
  try {
    const response = await callApiGatewayJson({
      body: {
        job_id: jobId,
        max_retries: Math.max(currentMaxRetries, retryCount + 1),
        user_id: userId,
      },
      path: "/api/content-jobs/retry",
    });

    return response.ok;
  } catch (error) {
    if (error instanceof ApiGatewayConfigurationError) {
      return false;
    }

    return false;
  }
}
