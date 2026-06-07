import type { Job } from "bullmq";

import type { AutomationAsyncJobResponse } from "../automationClient.js";
import type { ContentJobStore } from "../contentJobStore.js";
import type { NewVideoPublishedPayload } from "../mediaJobSchema.js";
import type { YouTubeVideoMetadata } from "../providerClients.js";

export type VideoPublishedAutomationClient = {
  enqueueTitleGeneration(payload: {
    contentJobId: string;
    duration: string | null;
    provider: "youtube";
    tags: string[];
    title?: string;
    userId: string;
    videoId: string;
  }): Promise<AutomationAsyncJobResponse>;
};

export type YouTubeMetadataClient = {
  fetchVideoMetadata(input: {
    channelId: string;
    userId: string;
    videoId: string;
  }): Promise<YouTubeVideoMetadata>;
};

export type VideoPublishedHandlerOptions = {
  automationClient: VideoPublishedAutomationClient;
  contentJobStore: ContentJobStore;
  now?: () => Date;
  youtubeClient: YouTubeMetadataClient;
};

export async function handleVideoPublishedJob(
  job: Pick<Job<NewVideoPublishedPayload>, "data" | "id">,
  {
    automationClient,
    contentJobStore,
    now = () => new Date(),
    youtubeClient,
  }: VideoPublishedHandlerOptions,
): Promise<void> {
  const startedAt = now();
  const payload = job.data;
  const contentJob = await contentJobStore.create({
    jobType: "repurposing",
    payload: {
      channelId: payload.channelId,
      provider: payload.provider,
      publishedAt: payload.publishedAt,
      title: payload.title,
      videoId: payload.videoId,
    },
    queueJobId: getContentQueueJobId(job.id, payload),
    userId: payload.userId,
  });

  try {
    const metadata = await youtubeClient.fetchVideoMetadata({
      channelId: payload.channelId,
      userId: payload.userId,
      videoId: payload.videoId,
    });
    const automationJob = await automationClient.enqueueTitleGeneration({
      contentJobId: contentJob.id,
      duration: metadata.duration,
      provider: "youtube",
      tags: metadata.tags,
      title: payload.title,
      userId: payload.userId,
      videoId: payload.videoId,
    });

    await contentJobStore.update({
      id: contentJob.id,
      result: {
        automationJobId: automationJob.jobId,
        duration: metadata.duration,
        likeCount: metadata.likeCount,
        tags: metadata.tags,
        viewCount: metadata.viewCount,
      },
      startedAt: now().toISOString(),
      status: "processing",
    });

    console.info(
      JSON.stringify({
        level: "info",
        contentJobId: contentJob.id,
        durationMs: now().getTime() - startedAt.getTime(),
        message: "video_published_job_processing_started",
        provider: payload.provider,
        userId: payload.userId,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await contentJobStore.update({
      completedAt: now().toISOString(),
      errorMessage: message,
      id: contentJob.id,
      result: { error: message },
      status: "failed",
    });
  }
}

function getContentQueueJobId(
  jobId: string | number | undefined,
  payload: NewVideoPublishedPayload,
): string {
  return `media:${String(jobId ?? payload.videoId)}:repurposing`;
}
