import type { CreatorPrimaryLanguage } from "@streamos/types";
import type { Tables } from "@streamos/database";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseSetupNotice } from "@/lib/supabase/messages";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";

type CreatorProfileDefaults = Pick<
  Tables<"creators">,
  "avatar_url" | "bio" | "display_name" | "primary_language"
>;

export default async function OnboardingProfilePage() {
  if (!isSupabaseConfigured()) {
    return (
      <section className="mx-auto grid w-full max-w-3xl gap-6 rounded-lg border border-signal-gold/30 bg-signal-gold/10 p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal-gold">
            Step 1
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Creator-Profil
          </h1>
          <p className="mt-3 text-sm leading-6 text-signal-gold">
            {getSupabaseSetupNotice("du Step 1 speichern kannst")}
          </p>
        </div>
      </section>
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const fallbackDisplayName =
    user?.user_metadata.name ||
    user?.user_metadata.full_name ||
    user?.email?.split("@")[0] ||
    "StreamOS Creator";

  const { data: creatorData } = await supabase
    .from("creators")
    .select("avatar_url, bio, display_name, primary_language")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const creator = (creatorData ?? null) as CreatorProfileDefaults | null;

  const primaryLanguage =
    creator?.primary_language === "DE" ||
    creator?.primary_language === "EN" ||
    creator?.primary_language === "Other"
      ? creator.primary_language
      : "EN";

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-signal-green">
          Step 1
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Creator-Profil anlegen
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Lege die Basisdaten fuer deinen StreamOS Workspace fest. Diese Daten
          bleiben user-scoped in Supabase und werden spaeter fuer Plattformen,
          Analytics und Branding wiederverwendet.
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 p-5">
        <ProfileForm
          defaultValues={{
            avatarUrl: creator?.avatar_url ?? "",
            bio: creator?.bio ?? "",
            displayName: creator?.display_name ?? fallbackDisplayName,
            primaryLanguage: primaryLanguage as CreatorPrimaryLanguage,
          }}
        />
      </div>
    </section>
  );
}
