import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { isSupabaseEmailConfirmed } from "@/lib/auth/dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { onboardingSteps } from "./types";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const headerStore = await headers();
  const pathname =
    headerStore.get("x-streamos-pathname") ?? "/onboarding/profile";

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      redirect(
        `/auth/login?error=unauthorized&next=${encodeURIComponent(pathname)}`,
      );
    }

    if (!isSupabaseEmailConfirmed(data.user)) {
      redirect("/auth/verify-email");
    }
  }

  const activeStep =
    onboardingSteps.find((step) => pathname.startsWith(step.href))?.id ?? 1;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-5xl content-center gap-8">
        <nav
          aria-label="Onboarding Fortschritt"
          className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
        >
          <ol className="grid gap-2 sm:grid-cols-3">
            {onboardingSteps.map((step) => {
              const isActive = step.id === activeStep;
              const isComplete = step.id < activeStep;

              return (
                <li
                  className={[
                    "flex items-center gap-3 rounded-lg border px-3 py-2",
                    isActive
                      ? "border-signal-green/50 bg-signal-green/10 text-white"
                      : "border-white/10 bg-white/5 text-slate-400",
                  ].join(" ")}
                  key={step.id}
                >
                  <span
                    className={[
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      isActive || isComplete
                        ? "bg-signal-green text-slate-950"
                        : "bg-white/10 text-slate-300",
                    ].join(" ")}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : step.id}
                  </span>
                  <span className="text-sm font-semibold">{step.label}</span>
                </li>
              );
            })}
          </ol>
        </nav>

        {children}
      </div>
    </main>
  );
}
