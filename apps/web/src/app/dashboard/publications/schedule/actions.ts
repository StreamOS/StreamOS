"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ApiGatewayConfigurationError,
  callApiGatewayJson,
} from "@/lib/api-gateway";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type PublicationScheduleMutationKind = "fanout" | "publication";
type PublicationScheduleMutationAction = "cancel" | "edit" | "replace";

export async function mutatePublicationScheduleAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/publications/schedule?error=supabase-not-configured");
  }

  const kind = normalizeKind(formData.get("kind"));
  const scheduleAction = normalizeAction(formData.get("scheduleAction"));
  const itemId = String(formData.get("itemId") ?? "").trim();

  if (!kind) {
    redirect("/dashboard/publications/schedule?error=invalid-schedule-kind");
  }

  if (!scheduleAction) {
    redirect("/dashboard/publications/schedule?error=invalid-schedule-action");
  }

  if (!itemId) {
    redirect("/dashboard/publications/schedule?error=invalid-schedule-item");
  }

  if (scheduleAction === "cancel") {
    const confirmation = String(formData.get("confirmCancel") ?? "").trim();

    if (confirmation !== "true") {
      redirect(
        `/dashboard/publications/schedule?error=cancel-not-confirmed&scheduleItemId=${itemId}`,
      );
    }
  }

  const scheduledAtUtc = String(formData.get("scheduledAtUtc") ?? "").trim();
  const scheduledTimezone = String(
    formData.get("scheduledTimezone") ?? "",
  ).trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (scheduleAction !== "cancel" && (!scheduledAtUtc || !scheduledTimezone)) {
    redirect(
      `/dashboard/publications/schedule?error=invalid-schedule-values&scheduleItemId=${itemId}`,
    );
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const basePath =
    kind === "publication"
      ? `/api/content-publications/${itemId}/schedule`
      : `/api/content-publications/fanouts/${itemId}/schedule`;

  try {
    const result = await callApiGatewayJson<Record<string, unknown>>({
      body: {
        action: scheduleAction,
        reason: reason || undefined,
        scheduled_at_utc: scheduledAtUtc || null,
        scheduled_timezone: scheduledTimezone || null,
        user_id: userData.user.id,
      },
      method: "POST",
      path: basePath,
    });

    if (!result.ok) {
      const error =
        isRecord(result.data) && typeof result.data.error === "string"
          ? result.data.error
          : "schedule-action-failed";
      const apiMessage =
        isRecord(result.data) && typeof result.data.message === "string"
          ? result.data.message
          : result.error;

      redirect(
        `/dashboard/publications/schedule?error=${encodeURIComponent(error)}&reason=${encodeURIComponent(apiMessage)}&scheduleItemId=${itemId}`,
      );
    }

    const response = isRecord(result.data) ? result.data : {};
    const selectedItemId =
      typeof response.replacement_content_publication_id === "string"
        ? response.replacement_content_publication_id
        : typeof response.replacement_content_publication_fanout_id === "string"
          ? response.replacement_content_publication_fanout_id
          : itemId;
    const status =
      typeof response.status === "string"
        ? response.status
        : "schedule-updated";

    revalidatePath("/dashboard/publications");
    revalidatePath("/dashboard/publications/fanouts");
    revalidatePath("/dashboard/publications/schedule");

    redirect(
      `/dashboard/publications/schedule?status=${encodeURIComponent(status)}&scheduleItemId=${encodeURIComponent(selectedItemId)}`,
    );
  } catch (error) {
    if (error instanceof ApiGatewayConfigurationError) {
      redirect("/dashboard/publications/schedule?error=gateway-not-configured");
    }

    redirect(
      `/dashboard/publications/schedule?error=schedule-action-failed&scheduleItemId=${encodeURIComponent(itemId)}`,
    );
  }
}

function normalizeAction(
  value: FormDataEntryValue | null,
): PublicationScheduleMutationAction | null {
  const normalized = String(value ?? "").trim();

  if (
    normalized === "cancel" ||
    normalized === "edit" ||
    normalized === "replace"
  ) {
    return normalized;
  }

  return null;
}

function normalizeKind(
  value: FormDataEntryValue | null,
): PublicationScheduleMutationKind | null {
  const normalized = String(value ?? "").trim();

  if (normalized === "fanout" || normalized === "publication") {
    return normalized;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
