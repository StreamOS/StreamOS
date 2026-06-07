import type {
  AuthError,
  AuthErrorCode,
  AuthMessageCode,
} from "@streamos/types";

export const authErrorMessages: Record<AuthErrorCode, string> = {
  callback_exchange_failed:
    "Auth-Callback fehlgeschlagen. Bitte starte den Login erneut.",
  confirmation_failed:
    "Email-Bestaetigung fehlgeschlagen oder Link abgelaufen.",
  invalid_credentials: "Login fehlgeschlagen. Bitte pruefe Email und Passwort.",
  invalid_email:
    "Diese Email-Adresse wird von Supabase nicht akzeptiert. Nutze eine echte, erreichbare Adresse.",
  missing_callback_params:
    "Auth-Callback unvollstaendig. Bitte starte den Login erneut.",
  password_mismatch: "Die beiden Passwoerter stimmen nicht ueberein.",
  password_reset_failed:
    "Reset-Email konnte nicht gesendet werden. Bitte pruefe die Adresse.",
  password_update_failed:
    "Passwort konnte nicht aktualisiert werden. Bitte nutze einen neuen Reset-Link.",
  profile_bootstrap_failed:
    "User-Profil konnte nicht initialisiert werden. Bitte versuche es erneut.",
  reset_session_required:
    "Reset-Link abgelaufen oder ungueltig. Fordere bitte einen neuen Link an.",
  session_expired: "Deine Session ist abgelaufen. Bitte logge dich erneut ein.",
  signup_failed: "Signup fehlgeschlagen. Bitte pruefe deine Eingaben.",
  supabase_not_configured: "Supabase ist noch nicht konfiguriert.",
  unauthorized: "Bitte logge dich ein, um fortzufahren.",
};

export const authMessageMessages: Record<AuthMessageCode, string> = {
  check_email: "Bitte bestaetige deine Email-Adresse, bevor du dich einloggst.",
  email_confirmed: "Email bestaetigt. Dein Workspace ist bereit.",
  password_reset_sent:
    "Wenn ein Account existiert, wurde eine Reset-Email gesendet.",
  password_updated: "Passwort aktualisiert. Du kannst dich jetzt einloggen.",
};

export function createAuthError(code: AuthErrorCode, status = 400): AuthError {
  return {
    code,
    message: authErrorMessages[code],
    status,
  };
}

export function authErrorRedirectUrl(
  requestUrl: string,
  error: AuthError,
  pathname = "/auth/login",
): URL {
  const redirectTo = new URL(pathname, requestUrl);

  redirectTo.searchParams.set("error", error.code);

  return redirectTo;
}

export function normalizeAuthErrorCode(value: string): AuthErrorCode | null {
  const normalized = value.replaceAll("-", "_");

  return normalized in authErrorMessages ? (normalized as AuthErrorCode) : null;
}

export function normalizeAuthMessageCode(
  value: string,
): AuthMessageCode | null {
  const normalized = value.replaceAll("-", "_");

  return normalized in authMessageMessages
    ? (normalized as AuthMessageCode)
    : null;
}
