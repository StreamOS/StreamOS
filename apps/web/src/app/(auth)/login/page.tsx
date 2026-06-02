import { redirect } from "next/navigation";
import { signIn, signUp } from "../actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
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
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-signal-green font-black text-white">
              S
            </div>
            <div>
              <div className="text-2xl font-semibold text-white">StreamOS</div>
              <div className="text-sm text-slate-400">
                Creator Operating System
              </div>
            </div>
          </div>
        </div>

        {!configured && (
          <div className="mb-6 rounded-lg border border-signal-gold/30 bg-signal-gold/10 p-4 text-sm text-signal-gold">
            Supabase ist lokal noch nicht konfiguriert. Fuellen Sie
            `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
            `apps/web/.env.local`, dann sind Login und Dashboard-Schutz aktiv.
          </div>
        )}

        {params.error && <StatusMessage type="error" value={params.error} />}
        {params.message && (
          <StatusMessage type="message" value={params.message} />
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <AuthPanel
            action={signIn}
            buttonLabel="Einloggen"
            description="Melde dich mit deinem StreamOS Workspace an."
            includeName={false}
            title="Login"
          />
          <AuthPanel
            action={signUp}
            buttonLabel="Account erstellen"
            description="Erstelle deinen ersten Creator Workspace."
            includeName
            title="Signup"
          />
        </section>
      </div>
    </main>
  );
}

type AuthPanelProps = {
  action: (formData: FormData) => Promise<void>;
  buttonLabel: string;
  description: string;
  includeName: boolean;
  title: string;
};

function AuthPanel({
  action,
  buttonLabel,
  description,
  includeName,
  title,
}: AuthPanelProps) {
  return (
    <form action={action} className="card">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
      <div className="mt-6 grid gap-4">
        {includeName && (
          <label className="grid gap-2 text-sm font-semibold text-slate-300">
            Creator Name
            <input
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green"
              name="displayName"
              placeholder="NovaPlays"
            />
          </label>
        )}
        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Email
          <input
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green"
            name="email"
            placeholder="creator@example.com"
            required
            type="email"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Passwort
          <input
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        <button className="btn-primary" type="submit">
          {buttonLabel}
        </button>
      </div>
    </form>
  );
}

function StatusMessage({
  type,
  value,
}: {
  type: "error" | "message";
  value: string;
}) {
  const copy: Record<string, string> = {
    "check-email":
      "Bitte bestaetige deine Email-Adresse, bevor du dich einloggst.",
    "confirmation-failed":
      "Email-Bestaetigung fehlgeschlagen oder Link abgelaufen.",
    "invalid-email":
      "Diese Email-Adresse wird von Supabase nicht akzeptiert. Nutze eine echte, erreichbare Adresse.",
    "invalid-credentials":
      "Login fehlgeschlagen. Bitte pruefe Email und Passwort.",
    "signup-failed": "Signup fehlgeschlagen. Bitte pruefe deine Eingaben.",
    "supabase-not-configured": "Supabase ist noch nicht konfiguriert.",
  };

  const color =
    type === "error"
      ? "border-signal-red/30 bg-signal-red/10 text-signal-red"
      : "border-signal-green/30 bg-signal-green/10 text-signal-green";

  return (
    <div className={`mb-6 rounded-lg border p-4 text-sm ${color}`}>
      {copy[value] ?? value}
    </div>
  );
}
