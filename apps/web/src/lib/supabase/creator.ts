import type { User } from "@supabase/supabase-js";
import type { Inserts, Tables } from "@streamos/database";
import type { createClient } from "./server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
export type CreatorWorkspace = Pick<Tables<"creators">, "display_name" | "handle" | "id" | "niche">;

export async function ensureCreatorForUser(supabase: SupabaseServerClient, user: User): Promise<CreatorWorkspace> {
  const existing = await supabase
    .from("creators")
    .select("id, display_name, handle, niche")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return existing.data as CreatorWorkspace;
  }

  const displayName = user.user_metadata.name || user.email?.split("@")[0] || "StreamOS Creator";
  const creatorInsert: Inserts<"creators"> = {
    display_name: displayName,
    owner_id: user.id
  };

  const created = await supabase
    .from("creators")
    .insert(creatorInsert as never)
    .select("id, display_name, handle, niche")
    .single();

  if (created.error) {
    throw created.error;
  }

  return created.data as CreatorWorkspace;
}
