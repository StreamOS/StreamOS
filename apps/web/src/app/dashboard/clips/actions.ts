"use server";

import type { Inserts, Json, Tables, Updates } from "@streamos/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildClipGenerationQueuePayload,
  getClipGenerationQueueJobId,
  getClipPlatformStreamId,
  parseClipAnalysisFormData,
} from "./jobContract";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ChannelRow = Pick<Tables<"channels">, "id" | "platform">;
type StreamRow = Pick<Tables<"streams">, "id">;

export async function startClipAnalysisAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/clips?error=supabase-not-configured");
  }

  const apiGatewayUrl = process.env.API_GATEWAY_URL?.trim();
  const apiGatewaySecret = process.env.API_GATEWAY_SECRET?.trim();

  if (!apiGatewayUrl) {
    redirect("/dashboard/clips?error=api-gateway-not-configured");
  }

  let values: ReturnType<typeof parseClipAnalysisFormData>;

  try {
    values = parseClipAnalysisFormData(formData);
  } catch {
    redirect("/dashboard/clips?error=invalid-vod-url");
  }

  const supabase = await createClient();
  const serviceSupabase = createServiceRoleClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/login");
  }

  const userId = userData.user.id;
  const creator = await ensureCreatorForUser(supabase, userData.user);
  const channel = await getPrimaryChannel({
    creatorId: creator.id,
    supabase,
    userId,
  });

  if (!channel) {
    redirect("/dashboard/clips?error=no-channel");
  }

  const stream = await ensureStreamForVod({
    category: values.category,
    channelId: channel.id,
    provider: channel.platform,
    sourceUrl: values.sourceUrl,
    supabase: serviceSupabase,
    userId,
  });
  const queuePayload = buildClipGenerationQueuePayload({
    creatorId: creator.id,
    requestedBy: userId,
    sourcePlatform: values.sourcePlatform,
    sourceUrl: values.sourceUrl,
    streamId: stream.id,
    transcript: values.transcript,
  });
  const expectedQueueJobId = getClipGenerationQueueJobId(stream.id);

  await upsertContentJob({
    patch: {
      error_message: null,
      payload: {
        ...queuePayload,
        category: values.category,
        chat_activity: values.chatActivity,
      },
      queue_job_id: expectedQueueJobId,
      result: null,
      status: "pending",
    },
    streamId: stream.id,
    supabase: serviceSupabase,
    userId,
  });

  try {
    const response = await fetch(
      new URL("/api/clips/generate", apiGatewayUrl),
      {
        body: JSON.stringify(queuePayload),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(apiGatewaySecret
            ? { Authorization: `Bearer ${apiGatewaySecret}` }
            : {}),
        },
        method: "POST",
      },
    );

    if (!response.ok) {
      throw new Error(`API gateway returned ${response.status}.`);
    }
  } catch (error) {
    await upsertContentJob({
      patch: {
        error_message:
          error instanceof Error
            ? error.message
            : "Clip generation queue request failed.",
        payload: {
          ...queuePayload,
          category: values.category,
          chat_activity: values.chatActivity,
        },
        queue_job_id: expectedQueueJobId,
        result: {
          error:
            error instanceof Error
              ? error.message
              : "Clip generation queue request failed.",
        },
        status: "failed",
      },
      streamId: stream.id,
      supabase: serviceSupabase,
      userId,
    });
    revalidatePath("/dashboard/clips");
    redirect("/dashboard/clips?error=clip-queue-failed");
  }

  revalidatePath("/dashboard/clips");
  redirect("/dashboard/clips?status=clip-queued");
}

async function getPrimaryChannel({
  creatorId,
  supabase,
  userId,
}: {
  creatorId: string;
  supabase: SupabaseServerClient;
  userId: string;
}): Promise<ChannelRow | null> {
  const result = await supabase
    .from("channels")
    .select("id,platform")
    .eq("user_id", userId)
    .eq("creator_id", creatorId)
    .order("connected_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw result.error;
  }

  return (result.data as ChannelRow | null) ?? null;
}

async function ensureStreamForVod({
  category,
  channelId,
  provider,
  sourceUrl,
  supabase,
  userId,
}: {
  category: string | null;
  channelId: string;
  provider: ChannelRow["platform"];
  sourceUrl: string;
  supabase: SupabaseServerClient;
  userId: string;
}): Promise<StreamRow> {
  const platformStreamId = getClipPlatformStreamId(sourceUrl);
  const existing = await supabase
    .from("streams")
    .select("id")
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .eq("platform_stream_id", platformStreamId)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return existing.data as StreamRow;
  }

  const payload: Inserts<"streams"> = {
    channel_id: channelId,
    platform_stream_id: platformStreamId,
    provider,
    title: category ? `${category} VOD analysis` : "VOD analysis",
    user_id: userId,
  };
  const created = await supabase
    .from("streams")
    .insert(payload as never)
    .select("id")
    .single();

  if (created.error) {
    throw created.error;
  }

  return created.data as StreamRow;
}

async function upsertContentJob({
  patch,
  streamId,
  supabase,
  userId,
}: {
  patch: Pick<
    Inserts<"content_jobs">,
    "error_message" | "payload" | "queue_job_id" | "result" | "status"
  >;
  streamId: string;
  supabase: SupabaseServerClient;
  userId: string;
}) {
  const existing = await supabase
    .from("content_jobs")
    .select("id")
    .eq("queue_job_id", patch.queue_job_id ?? "")
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    const updatePayload: Updates<"content_jobs"> = {
      error_message: patch.error_message,
      next_retry_at: null,
      payload: patch.payload as Json,
      result: patch.result as Json | null,
      status: patch.status,
    };
    const updated = await supabase
      .from("content_jobs")
      .update(updatePayload as never)
      .eq("user_id", userId)
      .eq("id", (existing.data as Pick<Tables<"content_jobs">, "id">).id);

    if (updated.error) {
      throw updated.error;
    }

    return;
  }

  const insertPayload: Inserts<"content_jobs"> = {
    error_message: patch.error_message,
    job_type: "clip_scoring",
    next_retry_at: null,
    payload: patch.payload,
    queue_job_id: patch.queue_job_id,
    result: patch.result,
    status: patch.status,
    stream_id: streamId,
    user_id: userId,
  };
  const inserted = await supabase
    .from("content_jobs")
    .insert(insertPayload as never);

  if (inserted.error) {
    throw inserted.error;
  }
}
