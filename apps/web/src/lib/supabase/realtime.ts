import type { Tables } from "@streamos/database";
import { createClient } from "./client";

export type ContentJobRow = Tables<"content_jobs">;

export type ContentJobStatusHandler = (job: ContentJobRow) => void;
export type ContentJobsRealtimeStatus =
  | "channel_error"
  | "closed"
  | "connecting"
  | "subscribed"
  | "timed_out";

export type ContentJobsRealtimeStatusHandler = (
  status: ContentJobsRealtimeStatus,
) => void;

export function subscribeToContentJobs({
  onChange,
  onStatus,
  userId,
}: {
  onChange: ContentJobStatusHandler;
  onStatus?: ContentJobsRealtimeStatusHandler;
  userId: string;
}) {
  const supabase = createClient();
  const filter = `user_id=eq.${userId}`;
  onStatus?.("connecting");

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
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onStatus?.("subscribed");
        return;
      }

      if (status === "CHANNEL_ERROR") {
        onStatus?.("channel_error");
        return;
      }

      if (status === "TIMED_OUT") {
        onStatus?.("timed_out");
        return;
      }

      if (status === "CLOSED") {
        onStatus?.("closed");
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function fetchContentJobsSnapshot({
  limit = 100,
  userId,
}: {
  limit?: number;
  userId: string;
}): Promise<ContentJobRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("content_jobs")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["pending", "running", "failed", "done"])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as ContentJobRow[];
}
