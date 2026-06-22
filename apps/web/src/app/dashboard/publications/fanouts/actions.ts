"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ApiGatewayConfigurationError,
  callApiGatewayJson,
} from "@/lib/api-gateway";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type FanoutActionStatus =
  | "fanout-target-rechecked"
  | "fanout-child-retry-queued"
  | "fanout-aggregate-refreshed";

export async function recheckFanoutTargetAction(formData: FormData) {
  return handleFanoutAction(formData, "recheck-target");
}

export async function retryFanoutChildPublicationAction(formData: FormData) {
  return handleFanoutAction(formData, "retry-child");
}

export async function refreshFanoutAggregateAction(formData: FormData) {
  return handleFanoutAction(formData, "refresh");
}

async function handleFanoutAction(
  formData: FormData,
  actionPath: "recheck-target" | "retry-child" | "refresh",
) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/publications/fanouts?error=supabase-not-configured");
  }

  const fanoutId = String(formData.get("fanoutId") ?? "").trim();

  if (!fanoutId) {
    redirect("/dashboard/publications/fanouts?error=invalid-fanout");
  }

  const targetId = String(formData.get("targetId") ?? "").trim();
  const publicationId = String(formData.get("publicationId") ?? "").trim();

  if (actionPath !== "refresh" && !targetId) {
    redirect(
      `/dashboard/publications/fanouts?error=invalid-fanout-target&fanoutId=${fanoutId}`,
    );
  }

  if (actionPath === "retry-child" && !publicationId) {
    redirect(
      `/dashboard/publications/fanouts?error=invalid-publication&fanoutId=${fanoutId}`,
    );
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const userId = userData.user.id;

  try {
    const result = await callApiGatewayJson<{
      block_reason?: string | null;
      content_publication_fanout_id: string;
      content_publication_fanout_target_id?: string | null;
      content_publication_id?: string | null;
      fanout_status: string;
      last_action_result?: string | null;
      message?: string | null;
      queue_job_id?: string | null;
      status: FanoutActionStatus;
      target_status?: string | null;
      user_id: string;
    }>({
      body: {
        user_id: userId,
      },
      method: "POST",
      path:
        actionPath === "refresh"
          ? `/api/content-publications/fanouts/${fanoutId}/refresh`
          : actionPath === "recheck-target"
            ? `/api/content-publications/fanouts/${fanoutId}/targets/${targetId}/recheck`
            : `/api/content-publications/fanouts/${fanoutId}/children/${publicationId}/retry`,
    });

    if (!result.ok) {
      const error =
        isRecord(result.data) && typeof result.data.error === "string"
          ? result.data.error
          : "fanout-action-failed";
      const reason =
        isRecord(result.data) && typeof result.data.message === "string"
          ? result.data.message
          : result.error;

      redirect(
        `/dashboard/publications/fanouts?error=${encodeURIComponent(error)}&reason=${encodeURIComponent(reason)}&fanoutId=${fanoutId}`,
      );
    }
  } catch (error) {
    if (error instanceof ApiGatewayConfigurationError) {
      redirect("/dashboard/publications/fanouts?error=gateway-not-configured");
    }

    redirect(
      `/dashboard/publications/fanouts?error=fanout-action-failed&fanoutId=${fanoutId}`,
    );
  }

  revalidatePath("/dashboard/publications/fanouts");
  revalidatePath("/dashboard/publications");

  const statusByAction: Record<
    "recheck-target" | "retry-child" | "refresh",
    FanoutActionStatus
  > = {
    "recheck-target": "fanout-target-rechecked",
    refresh: "fanout-aggregate-refreshed",
    "retry-child": "fanout-child-retry-queued",
  };

  redirect(
    `/dashboard/publications/fanouts?status=${statusByAction[actionPath]}&fanoutId=${fanoutId}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
