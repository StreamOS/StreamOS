"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { Inserts, Updates } from "@streamos/database";
import { isSupabaseEmailConfirmed } from "@/lib/auth/dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";
import type { OnboardingActionState } from "./types";

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().url("Bitte gib eine gueltige URL ein.").nullable(),
);

const optionalBioSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .trim()
    .max(280, "Die Bio darf maximal 280 Zeichen haben.")
    .nullable(),
);

const creatorProfileSchema = z.object({
  avatarUrl: optionalUrlSchema,
  bio: optionalBioSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Der Display Name muss mindestens 2 Zeichen haben.")
    .max(120, "Der Display Name darf maximal 120 Zeichen haben."),
  primaryLanguage: z.enum(["DE", "EN", "Other"]),
});

export async function createOrUpdateCreatorProfileAction(
  _previousState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  if (!isSupabaseConfigured()) {
    return {
      formError:
        "Supabase ist lokal noch nicht konfiguriert. Step 1 kann nicht gespeichert werden.",
    };
  }

  const parsed = creatorProfileSchema.safeParse({
    avatarUrl: formData.get("avatarUrl"),
    bio: formData.get("bio"),
    displayName: formData.get("displayName"),
    primaryLanguage: formData.get("primaryLanguage"),
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;

    return {
      fieldErrors: {
        avatarUrl: flattened.avatarUrl?.[0],
        bio: flattened.bio?.[0],
        displayName: flattened.displayName?.[0],
        primaryLanguage: flattened.primaryLanguage?.[0],
      },
      formError: "Bitte pruefe die markierten Felder.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login?error=unauthorized&next=/onboarding/profile");
  }

  if (!isSupabaseEmailConfirmed(data.user)) {
    redirect("/auth/verify-email");
  }

  const creatorPayload: Inserts<"creators"> = {
    avatar_url: parsed.data.avatarUrl,
    bio: parsed.data.bio,
    display_name: parsed.data.displayName,
    email: data.user.email ?? null,
    id: data.user.id,
    onboarding_completed: false,
    onboarding_step: 1,
    primary_language: parsed.data.primaryLanguage,
    user_id: data.user.id,
  };

  const { error: upsertError } = await supabase
    .from("creators")
    .upsert(creatorPayload as never, { onConflict: "user_id" });

  if (upsertError) {
    return {
      formError:
        "Creator-Profil konnte nicht gespeichert werden. Bitte versuche es erneut.",
    };
  }

  redirect("/onboarding/platforms");
}

export async function markPlatformStepComplete(
  skipped: boolean,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    redirect("/onboarding/platforms?error=supabase_not_configured");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login?error=unauthorized&next=/onboarding/platforms");
  }

  if (!isSupabaseEmailConfirmed(data.user)) {
    redirect("/auth/verify-email");
  }

  await ensureCreatorForUser(supabase, data.user);

  const updatePayload: Updates<"creators"> = {
    onboarding_completed: skipped,
    onboarding_step: 2,
  };

  const { error: updateError } = await supabase
    .from("creators")
    .update(updatePayload as never)
    .eq("user_id", data.user.id);

  if (updateError) {
    redirect("/onboarding/platforms?error=platform_step_update_failed");
  }

  redirect(skipped ? "/dashboard" : "/onboarding/complete");
}

export async function continueFromPlatformsAction(): Promise<void> {
  await markPlatformStepComplete(false);
}

export async function skipPlatformsAction(): Promise<void> {
  await markPlatformStepComplete(true);
}

export async function completeOnboardingForCurrentUser(): Promise<void> {
  if (!isSupabaseConfigured()) {
    redirect("/onboarding/complete?error=supabase_not_configured");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login?error=unauthorized&next=/onboarding/complete");
  }

  if (!isSupabaseEmailConfirmed(data.user)) {
    redirect("/auth/verify-email");
  }

  await ensureCreatorForUser(supabase, data.user);

  const updatePayload: Updates<"creators"> = {
    onboarding_completed: true,
    onboarding_step: 3,
  };

  const { error: updateError } = await supabase
    .from("creators")
    .update(updatePayload as never)
    .eq("user_id", data.user.id);

  if (updateError) {
    redirect("/onboarding/complete?error=completion_failed");
  }
}

export async function completeOnboardingAction(): Promise<void> {
  await completeOnboardingForCurrentUser();
  redirect("/dashboard");
}
