import "server-only";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "@streamos/database";
import type { createClient as createServerSupabaseClient } from "./server";
import { getSupabaseServiceRoleConfig } from "./config";

type ServerSupabaseClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

export function createServiceRoleClient() {
  const config = getSupabaseServiceRoleConfig();

  if (!config) {
    throw new Error(
      "Missing server Supabase service-role environment variables.",
    );
  }

  return createSupabaseClient<Database, "public">(
    config.url,
    config.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          "X-Client-Info": "streamos-web-service-role",
        },
      },
    },
  ) as unknown as ServerSupabaseClient;
}

export function createServiceRoleAdminClient(): SupabaseClient<Database> {
  const config = getSupabaseServiceRoleConfig();

  if (!config) {
    throw new Error(
      "Missing server Supabase service-role environment variables.",
    );
  }

  return createSupabaseClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "streamos-web-auth-admin",
      },
    },
  });
}
