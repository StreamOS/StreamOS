"use server";

import type { Inserts, Tables } from "@streamos/database";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  buildClipGenerationQueuePayload,
  getClipPlatformStreamId,
  parseClipAnalysisFormData,
} from "./jobContract";
import {
  ApiGatewayConfigurationError,
  callApiGatewayJson,
} from "@/lib/api-gateway";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ensureCreatorForUser } from "@/lib/supabase/creator";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ChannelRow = Pick<Tables<"channels">, "id" | "platform">;
type StreamRow = Pick<Tables<"streams">, "id">;

export async function startClipAnalysisAction(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/dashboard/clips?error=supabase-not-configured");
  }

  let values: ReturnType<typeof parseClipAnalysisFormData>;

  try {
    values = parseClipAnalysisFormData(formData);
  } catch {
    redirect("/dashboard/clips?error=invalid-vod-url");
  }

  const supabase = await createClient();
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
    supabase,
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

  try {
    const result = await callApiGatewayJson({
      body: {
        ...queuePayload,
        category: values.category,
        channel_id: channel.id,
        chat_activity: values.chatActivity,
      },
      path: "/api/clips/generate",
    });

    if (!result.ok) {
      throw new Error(result.error);
    }
  } catch (error) {
    if (!(error instanceof ApiGatewayConfigurationError)) {
      console.error("Clip generation gateway request failed.", {
        error: error instanceof Error ? error.message : "Unknown error",
        streamId: stream.id,
        userId,
      });
    }
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
