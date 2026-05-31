import { redirect } from "next/navigation";
import { signOut } from "../(auth)/actions";
import { Sidebar } from "@/components/layout/Sidebar";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser, type CreatorWorkspace } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const configured = isSupabaseConfigured();

  if (!configured) {
    return (
      <div className="min-h-screen">
        <Sidebar creatorName="Demo Workspace" creatorNiche="Supabase noch nicht konfiguriert" />
        <main className="lg:pl-72">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <SupabaseSetupNotice />
            {children}
          </div>
        </main>
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  let creator: CreatorWorkspace | null = null;
  let creatorError: string | null = null;

  try {
    creator = await ensureCreatorForUser(supabase, data.user);
  } catch (error_) {
    creatorError = error_ instanceof Error ? error_.message : "Creator Bootstrap fehlgeschlagen.";
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        creatorName={creator?.display_name ?? data.user.email ?? "StreamOS Creator"}
        creatorNiche={creator?.niche ?? "Workspace bereit"}
        signOutAction={signOut}
      />
      <main className="lg:pl-72">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {creatorError && <CreatorBootstrapNotice message={creatorError} />}
          {children}
        </div>
      </main>
    </div>
  );
}

function SupabaseSetupNotice() {
  return (
    <section className="mb-6 rounded-lg border border-signal-gold/30 bg-signal-gold/10 p-4 text-sm text-signal-gold">
      Supabase ist lokal noch nicht konfiguriert. Das Dashboard laeuft im Demo-Modus. Setze
      `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`, um Login,
      Session-Schutz und Creator-Bootstrap zu aktivieren.
    </section>
  );
}

function CreatorBootstrapNotice({ message }: { message: string }) {
  return (
    <section className="mb-6 rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      Creator Workspace konnte nicht initialisiert werden: {message}. Pruefe, ob die initiale Supabase-Migration
      angewendet wurde.
    </section>
  );
}
