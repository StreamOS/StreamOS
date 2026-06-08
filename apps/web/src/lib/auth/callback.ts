import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import type { AuthErrorCode } from "@streamos/types";
import { authErrorRedirectUrl, createAuthError } from "./errors";
import { getSafeNextPath } from "./redirects";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES = new Set<string>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && EMAIL_OTP_TYPES.has(value);
}

function redirectWithError(
  request: NextRequest,
  code: AuthErrorCode,
  status = 400,
) {
  return NextResponse.redirect(
    authErrorRedirectUrl(request.url, createAuthError(code, status)),
  );
}

export async function handleAuthCallback(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return redirectWithError(request, "supabase_not_configured", 503);
  }

  const requestUrl = new URL(request.url);
  const providerError = requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const otpType = isEmailOtpType(type) ? type : null;
  const next = getSafeNextPath(
    requestUrl.searchParams.get("next"),
    type === "recovery" ? "/auth/update-password" : "/dashboard",
  );

  if (providerError) {
    return redirectWithError(request, "callback_exchange_failed");
  }

  if (!code && (!tokenHash || !otpType)) {
    return redirectWithError(request, "missing_callback_params");
  }

  const supabase = await createClient();
  const authResult = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: otpType!,
      });

  if (authResult.error) {
    return redirectWithError(
      request,
      code ? "callback_exchange_failed" : "confirmation_failed",
    );
  }

  if (next !== "/auth/update-password") {
    const userResult = await supabase.auth.getUser();

    if (userResult.error || !userResult.data.user) {
      return redirectWithError(request, "unauthorized", 401);
    }

    try {
      await ensureCreatorForUser(supabase, userResult.data.user);
    } catch {
      return redirectWithError(request, "profile_bootstrap_failed", 500);
    }
  }

  const redirectTo = new URL(next, request.url);

  if (next === "/dashboard") {
    redirectTo.searchParams.set("message", "email-confirmed");
  }

  return NextResponse.redirect(redirectTo);
}

export async function handleEmailConfirmation(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return redirectWithError(request, "supabase_not_configured", 503);
  }

  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!tokenHash || type !== "email") {
    return redirectWithError(request, "confirmation_failed");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (error) {
    return redirectWithError(request, "confirmation_failed");
  }

  const userResult = await supabase.auth.getUser();

  if (userResult.error || !userResult.data.user) {
    return redirectWithError(request, "confirmation_failed", 401);
  }

  try {
    await ensureCreatorForUser(supabase, userResult.data.user);
  } catch {
    return redirectWithError(request, "profile_bootstrap_failed", 500);
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
