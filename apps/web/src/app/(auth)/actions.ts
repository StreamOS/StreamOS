"use server";

import { redirect } from "next/navigation";
import type { AuthErrorCode } from "@streamos/types";
import { getRequestOrigin } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

function redirectWithError(pathname: string, code: AuthErrorCode): never {
  redirect(`${pathname}?error=${code.replaceAll("_", "-")}`);
}

function readEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    throw new Error("Email ist erforderlich.");
  }

  return email;
}

function readCredentials(formData: FormData) {
  const email = readEmail(formData);
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    throw new Error("Email und Passwort sind erforderlich.");
  }

  return { email, password };
}

export async function signIn(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirectWithError("/login", "supabase_not_configured");
  }

  const { email, password } = readCredentials(formData);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirectWithError("/login", "invalid_credentials");
  }

  await ensureCreatorForUser(supabase, data.user);
  const next = String(formData.get("next") ?? "/dashboard");
  redirect(
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard",
  );
}

export async function signUp(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirectWithError("/signup", "supabase_not_configured");
  }

  const { email, password } = readCredentials(formData);
  const displayName = String(formData.get("displayName") ?? "").trim();
  const origin = await getRequestOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
      data: {
        name: displayName || email.split("@")[0],
      },
    },
  });

  if (error || !data.user) {
    if (error?.code === "email_address_invalid") {
      redirectWithError("/signup", "invalid_email");
    }

    redirectWithError("/signup", "signup_failed");
  }

  if (data.session) {
    await ensureCreatorForUser(supabase, data.user);
    redirect("/dashboard");
  }

  redirect("/login?message=check-email");
}

export async function requestPasswordReset(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirectWithError("/forgot-password", "supabase_not_configured");
  }

  const email = readEmail(formData);
  const origin = await getRequestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    redirectWithError("/forgot-password", "password_reset_failed");
  }

  redirect("/login?message=password-reset-sent");
}

export async function updatePassword(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirectWithError("/reset-password", "supabase_not_configured");
  }

  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(
    formData.get("passwordConfirmation") ?? "",
  );

  if (!password || password !== passwordConfirmation) {
    redirectWithError("/reset-password", "password_mismatch");
  }

  const supabase = await createClient();
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    redirectWithError("/login", "reset_session_required");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirectWithError("/reset-password", "password_update_failed");
  }

  await supabase.auth.signOut();
  redirect("/login?message=password-updated");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  redirect("/login");
}
