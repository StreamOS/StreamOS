import { CheckCircle2, LayoutDashboard } from "lucide-react";
import {
  completeOnboardingAction,
  completeOnboardingForCurrentUser,
} from "../actions";
import { CompleteRedirect } from "./CompleteRedirect";
import { getSupabaseSetupNotice } from "@/lib/supabase/messages";

type OnboardingCompletePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  completion_failed:
    "Onboarding konnte nicht abgeschlossen werden. Bitte versuche es erneut.",
  supabase_not_configured: getSupabaseSetupNotice(
    "du das Onboarding abschließen kannst",
  ),
};

export default async function OnboardingCompletePage({
  searchParams,
}: OnboardingCompletePageProps) {
  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  if (!errorMessage) {
    await completeOnboardingForCurrentUser();
  }

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-signal-green/40 bg-signal-green/10 text-signal-green shadow-[0_0_60px_rgba(0,212,170,0.22)]">
        <CheckCircle2 className="h-10 w-10 animate-pulse" />
      </div>

      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal-green">
          Step 3
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          StreamOS ist bereit
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Dein Creator Workspace ist eingerichtet. Du wirst gleich ins Dashboard
          weitergeleitet.
        </p>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-3 text-sm text-signal-red">
          {errorMessage}
        </div>
      ) : (
        <CompleteRedirect />
      )}

      <form action={completeOnboardingAction} className="mx-auto">
        <button className="btn-primary gap-2" type="submit">
          <LayoutDashboard className="h-4 w-4" />
          Zum Dashboard
        </button>
      </form>
    </section>
  );
}
