import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@streamos/database";
import { getSupabaseConfig } from "./config";

export async function createClient() {
  const cookieStore = await cookies();
  type CookieToSet = {
    name: string;
    value: string;
    options?: Parameters<typeof cookieStore.set>[2];
  };
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error("Missing server Supabase environment variables.");
  }

  return createServerClient<Database, "public", Database["public"]>(
    config.url,
    config.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // Server Components cannot always mutate cookies. Server Actions and Route Handlers can.
            }
          });
        },
      },
    },
  );
}
