"use server";

import { redirect } from "next/navigation";
import { isSupabaseEmailConfirmed } from "@/lib/auth/dashboard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createServiceRoleAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function completeCreatorProfileAction() {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/onboarding?error=supabase_not_configured");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/auth/login?error=unauthorized");
  }

  if (!isSupabaseEmailConfirmed(data.user)) {
    redirect("/auth/verify-email");
  }

  try {
    await ensureCreatorForUser(supabase, data.user);

    const adminSupabase = createServiceRoleAdminClient();
    const metadata = data.user.user_metadata ?? {};
    const { error: metadataError } =
      await adminSupabase.auth.admin.updateUserById(data.user.id, {
        user_metadata: {
          ...metadata,
          profile_created: true,
        },
      });

    if (metadataError) {
      throw metadataError;
    }
  } catch {
    redirect("/dashboard/onboarding?error=profile_bootstrap_failed");
  }

  redirect("/dashboard");
}
