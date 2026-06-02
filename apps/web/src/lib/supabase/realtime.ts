import type { Tables } from "@streamos/database";
import { createClient } from "./client";

export type ContentJobRow = Tables<"content_jobs">;

export type ContentJobStatusHandler = (job: ContentJobRow) => void;

export function subscribeToContentJobs({
  onChange,
  userId,
}: {
  onChange: ContentJobStatusHandler;
  userId: string;
}) {
  const supabase = createClient();
  const filter = `user_id=eq.${userId}`;
  const channel = supabase
    .channel(`content_jobs:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "content_jobs",
        filter,
      },
      (payload) => onChange(payload.new as ContentJobRow),
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "content_jobs",
        filter,
      },
      (payload) => onChange(payload.new as ContentJobRow),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
