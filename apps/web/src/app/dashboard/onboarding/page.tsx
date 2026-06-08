import { CheckCircle2 } from "lucide-react";
import { completeCreatorProfileAction } from "./actions";
import { authErrorMessages, normalizeAuthErrorCode } from "@/lib/auth/errors";

type DashboardOnboardingPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function DashboardOnboardingPage({
  searchParams,
}: DashboardOnboardingPageProps) {
  const params = await searchParams;
  const errorCode = params.error ? normalizeAuthErrorCode(params.error) : null;

  return (
    <section className="grid gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal-green">
          Workspace Setup
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Creator-Profil wird vorbereitet
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          StreamOS wartet darauf, dass dein Creator-Profil vollstaendig
          initialisiert wurde. Sobald der Profil-Bootstrap abgeschlossen ist,
          fuehrt dich das Dashboard zu Analytics, Clips und Monetization.
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-signal-green" />
          <div>
            <h2 className="text-lg font-semibold text-white">
              Naechster Schritt
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Der Server prueft dein Creator-Profil und markiert den
              Profil-Bootstrap danach in Supabase Auth als abgeschlossen.
            </p>
            {errorCode ? (
              <div className="mt-4 rounded-lg border border-signal-red/30 bg-signal-red/10 p-3 text-sm text-signal-red">
                {authErrorMessages[errorCode]}
              </div>
            ) : null}
            <form action={completeCreatorProfileAction} className="mt-5">
              <button className="btn-primary" type="submit">
                Profil-Bootstrap abschliessen
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
