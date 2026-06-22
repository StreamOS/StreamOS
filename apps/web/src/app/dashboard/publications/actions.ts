"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ApiGatewayConfigurationError,
  callApiGatewayJson,
} from "@/lib/api-gateway";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type PublicationManualActionPath =
  | "retry"
  | "reconcile-now"
  | "mark-final-failed";

export async function retryPublicationAction(formData: FormData) {
  return handlePublicationManualAction(formData, "retry");
}

export async function reconcilePublicationAction(formData: FormData) {
  return handlePublicationManualAction(formData, "reconcile-now");
}

export async function markPublicationFinalFailedAction(formData: FormData) {
  return handlePublicationManualAction(formData, "mark-final-failed");
}

async function handlePublicationManualAction(
  formData: FormData,
  actionPath: PublicationManualActionPath,
) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/publications?error=supabase-not-configured");
  }

  const publicationId = String(formData.get("publicationId") ?? "").trim();

  if (!publicationId) {
    redirect("/dashboard/publications?error=invalid-publication");
  }

  if (actionPath === "mark-final-failed") {
    const confirmation = String(formData.get("confirmFinalFail") ?? "").trim();

    if (confirmation !== "true") {
      redirect(
        `/dashboard/publications?error=final-fail-not-confirmed&publicationId=${publicationId}`,
      );
    }
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  try {
    const result = await callApiGatewayJson({
      body: {
        user_id: userData.user.id,
        ...(actionPath === "mark-final-failed" ? { confirm: true } : {}),
      },
      path: `/api/content-publications/${publicationId}/${actionPath}`,
    });

    if (!result.ok) {
      const error =
        isRecord(result.data) && typeof result.data.error === "string"
          ? result.data.error
          : "manual-action-failed";
      const reason =
        isRecord(result.data) && typeof result.data.message === "string"
          ? result.data.message
          : result.error;

      redirect(
        `/dashboard/publications?error=${encodeURIComponent(error)}&reason=${encodeURIComponent(reason)}&publicationId=${publicationId}`,
      );
    }
  } catch (error) {
    if (error instanceof ApiGatewayConfigurationError) {
      redirect("/dashboard/publications?error=gateway-not-configured");
    }

    redirect(
      `/dashboard/publications?error=manual-action-failed&publicationId=${publicationId}`,
    );
  }

  revalidatePath("/dashboard/publications");

  const statusByAction: Record<PublicationManualActionPath, string> = {
    "mark-final-failed": "final-failed",
    "reconcile-now": "reconcile-requested",
    retry: "retry-requested",
  };

  redirect(
    `/dashboard/publications?status=${statusByAction[actionPath]}&publicationId=${publicationId}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
