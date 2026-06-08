import type { User } from "@supabase/supabase-js";
import type { DashboardAuthUser } from "@streamos/types";

export function isSupabaseEmailConfirmed(user: User) {
  if (!user.email) {
    return true;
  }

  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

export function hasCompletedProfileBootstrap(user: User) {
  const metadata = user.user_metadata as Record<string, unknown> | null;

  return metadata?.profile_created === true;
}

export function toDashboardAuthUser(user: User): DashboardAuthUser {
  return {
    email: user.email ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? user.confirmed_at ?? null,
    id: user.id,
    profileCreated: hasCompletedProfileBootstrap(user),
  };
}
