export type SupabaseConfig = {
  anonKey: string;
  url: string;
};

export function getSupabaseConfig(): SupabaseConfig | null {
  if (process.env.STREAMOS_DEMO_MODE === "true") {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { anonKey, url };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
