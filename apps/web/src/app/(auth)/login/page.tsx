import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "../actions";
import {
  AuthShell,
  AuthTextInput,
  SupabaseSetupNotice,
  type AuthSearchParams,
} from "../components";
import { getSafeNextPath } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<AuthSearchParams>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const next = getSafeNextPath(params.next ?? null);

  if (configured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      redirect(next);
    }
  }

  return (
    <AuthShell
      description="Melde dich mit deinem Creator Workspace an."
      searchParams={params}
      title="Login"
    >
      {!configured && <SupabaseSetupNotice />}
      <form action={signIn} className="grid gap-4">
        <input name="next" type="hidden" value={next} />
        <AuthTextInput
          autoComplete="email"
          label="Email"
          name="email"
          placeholder="creator@example.com"
          type="email"
        />
        <AuthTextInput
          autoComplete="current-password"
          label="Passwort"
          minLength={8}
          name="password"
          type="password"
        />
        <button className="btn-primary" type="submit">
          Einloggen
        </button>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
        <Link className="text-signal-green hover:text-white" href="/signup">
          Account erstellen
        </Link>
        <Link
          className="text-slate-300 hover:text-white"
          href="/forgot-password"
        >
          Passwort vergessen?
        </Link>
      </div>
    </AuthShell>
  );
}
