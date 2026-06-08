import { redirect } from "next/navigation";
import { updatePassword } from "../actions";
import {
  AuthShell,
  AuthTextInput,
  SupabaseSetupNotice,
  type AuthSearchParams,
} from "../components";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type ResetPasswordPageProps = {
  searchParams: Promise<AuthSearchParams>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      redirect("/login?error=reset-session-required");
    }
  }

  return (
    <AuthShell
      description="Lege ein neues Passwort fuer deinen Workspace fest."
      searchParams={params}
      title="Neues Passwort"
    >
      {!configured && <SupabaseSetupNotice />}
      <form action={updatePassword} className="grid gap-4">
        <AuthTextInput
          autoComplete="new-password"
          label="Neues Passwort"
          minLength={8}
          name="password"
          type="password"
        />
        <AuthTextInput
          autoComplete="new-password"
          label="Passwort bestaetigen"
          minLength={8}
          name="passwordConfirmation"
          type="password"
        />
        <button className="btn-primary" type="submit">
          Passwort speichern
        </button>
      </form>
    </AuthShell>
  );
}
