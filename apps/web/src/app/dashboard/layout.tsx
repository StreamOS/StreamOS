import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "../(auth)/actions";
import { DashboardAuthProvider } from "./DashboardAuthContext";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopHeader } from "@/components/layout/TopHeader";
import {
  isSupabaseEmailConfirmed,
  toDashboardAuthUser,
} from "@/lib/auth/dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  ensureCreatorForUser,
  type CreatorWorkspace,
} from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const configured = isSupabaseConfigured();

  if (!configured) {
    return (
      <div className="min-h-screen">
        <Sidebar
          creatorName="Demo Workspace"
          creatorNiche="Supabase noch nicht konfiguriert"
        />
        <div className="transition-[padding] duration-300 lg:pl-[var(--dashboard-sidebar-width,15rem)]">
          <TopHeader
            displayName="Demo Workspace"
            userEmail={null}
            userId="demo"
          />
          <main>
            <div className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-6 lg:px-8">
              <SupabaseSetupNotice />
              {children}
            </div>
          </main>
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login");
  }

  if (!isSupabaseEmailConfirmed(data.user)) {
    redirect("/auth/verify-email");
  }

  const headerStore = await headers();
  const pathname = headerStore.get("x-streamos-pathname") ?? "/dashboard";
  const isOnboardingRoute =
    pathname === "/dashboard/onboarding" ||
    pathname.startsWith("/dashboard/onboarding/") ||
    pathname === "/onboarding/profile" ||
    pathname.startsWith("/onboarding/");

  let creator: CreatorWorkspace | null = null;
  let creatorError: string | null = null;

  try {
    creator = await ensureCreatorForUser(supabase, data.user);
  } catch (error_) {
    creatorError =
      error_ instanceof Error
        ? error_.message
        : "Creator Bootstrap fehlgeschlagen.";
  }

  const onboardingComplete = creator?.onboarding_completed === true;

  if (!onboardingComplete && !isOnboardingRoute) {
    redirect("/onboarding/profile");
  }

  return (
    <DashboardAuthProvider user={toDashboardAuthUser(data.user)}>
      <div className="min-h-screen">
        <Sidebar
          creatorName={
            creator?.display_name ?? data.user.email ?? "StreamOS Creator"
          }
          creatorNiche={creator?.niche ?? "Workspace bereit"}
          signOutAction={signOut}
        />
        <div className="transition-[padding] duration-300 lg:pl-[var(--dashboard-sidebar-width,15rem)]">
          <TopHeader
            avatarUrl={creator?.avatar_url}
            displayName={
              creator?.display_name ?? data.user.email ?? "StreamOS Creator"
            }
            signOutAction={signOut}
            userEmail={data.user.email ?? null}
            userId={data.user.id}
          />
          <main>
            <div className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-6 lg:px-8">
              {creatorError && (
                <CreatorBootstrapNotice message={creatorError} />
              )}
              {children}
            </div>
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </DashboardAuthProvider>
  );
}

function SupabaseSetupNotice() {
  return (
    <section className="mb-6 rounded-lg border border-signal-gold/30 bg-signal-gold/10 p-4 text-sm text-signal-gold">
      Supabase ist lokal noch nicht konfiguriert. Das Dashboard laeuft im
      Demo-Modus. Setze `NEXT_PUBLIC_SUPABASE_URL` und
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`, um Login,
      Session-Schutz und Creator-Bootstrap zu aktivieren.
    </section>
  );
}

function CreatorBootstrapNotice({ message }: { message: string }) {
  return (
    <section className="mb-6 rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      Creator Workspace konnte nicht initialisiert werden: {message}. Pruefe, ob
      die initiale Supabase-Migration angewendet wurde.
    </section>
  );
}
