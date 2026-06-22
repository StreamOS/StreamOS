import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@streamos/database";
import { getSupabaseConfig } from "./config";

export function createOptionalBrowserClient() {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  return createBrowserClient<Database>(config.url, config.anonKey);
}

export function createClient() {
  const client = createOptionalBrowserClient();

  if (!client) {
    throw new Error("Missing browser Supabase environment variables.");
  }

  return client;
}
