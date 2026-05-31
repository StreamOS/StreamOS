import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@streamos/database";
import { getSupabaseConfig } from "./config";

export function createClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error("Missing browser Supabase environment variables.");
  }

  return createBrowserClient<Database, "public", Database["public"]>(config.url, config.anonKey);
}
