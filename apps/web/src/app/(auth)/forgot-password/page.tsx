import Link from "next/link";
import { requestPasswordReset } from "../actions";
import {
  AuthShell,
  AuthTextInput,
  SupabaseSetupNotice,
  type AuthSearchParams,
} from "../components";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type ForgotPasswordPageProps = {
  searchParams: Promise<AuthSearchParams>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <AuthShell
      description="Sende dir einen sicheren Reset-Link per Email."
      searchParams={params}
      title="Passwort zuruecksetzen"
    >
      {!configured && <SupabaseSetupNotice />}
      <form action={requestPasswordReset} className="grid gap-4">
        <AuthTextInput
          autoComplete="email"
          label="Email"
          name="email"
          placeholder="creator@example.com"
          type="email"
        />
        <button className="btn-primary" type="submit">
          Reset-Link senden
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-400">
        Zurueck zum{" "}
        <Link className="text-signal-green hover:text-white" href="/login">
          Login
        </Link>
      </p>
    </AuthShell>
  );
}
