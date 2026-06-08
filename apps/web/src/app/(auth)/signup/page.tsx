import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "../actions";
import {
  AuthShell,
  AuthTextInput,
  SupabaseSetupNotice,
  type AuthSearchParams,
} from "../components";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type SignupPageProps = {
  searchParams: Promise<AuthSearchParams>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      redirect("/dashboard");
    }
  }

  return (
    <AuthShell
      description="Erstelle deinen StreamOS Creator Workspace."
      searchParams={params}
      title="Signup"
    >
      {!configured && <SupabaseSetupNotice />}
      <form action={signUp} className="grid gap-4">
        <AuthTextInput
          autoComplete="name"
          label="Creator Name"
          name="displayName"
          placeholder="NovaPlays"
          required={false}
        />
        <AuthTextInput
          autoComplete="email"
          label="Email"
          name="email"
          placeholder="creator@example.com"
          type="email"
        />
        <AuthTextInput
          autoComplete="new-password"
          label="Passwort"
          minLength={8}
          name="password"
          type="password"
        />
        <button className="btn-primary" type="submit">
          Account erstellen
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-400">
        Schon registriert?{" "}
        <Link className="text-signal-green hover:text-white" href="/login">
          Einloggen
        </Link>
      </p>
    </AuthShell>
  );
}
