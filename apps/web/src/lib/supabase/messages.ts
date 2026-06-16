const SUPABASE_ENV_PATH = "`apps/web/.env.local`";
const SUPABASE_URL_ENV = "`NEXT_PUBLIC_SUPABASE_URL`";
const SUPABASE_BROWSER_KEY_ENV =
  "`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` oder `NEXT_PUBLIC_SUPABASE_ANON_KEY`";

export function getSupabaseSetupNotice(action: string) {
  return `Supabase ist lokal noch nicht konfiguriert. Bitte setze ${SUPABASE_URL_ENV} und einen browser-sicheren Supabase-Key (${SUPABASE_BROWSER_KEY_ENV}) in ${SUPABASE_ENV_PATH}, damit ${action}.`;
}
