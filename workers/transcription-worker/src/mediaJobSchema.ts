import { z } from "zod";

export const mediaJobPayloadSchema = z
  .union([
    z.object({
      type: z.literal("STREAM_ONLINE"),
      provider: z.literal("twitch"),
      userId: z.string().uuid(),
      channelId: z.string().trim().min(1),
      streamId: z.string().trim().min(1),
      startedAt: z.string().datetime(),
      enqueuedAt: z.string().datetime(),
      vodLookupAttempt: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("stream.online"),
      provider: z.literal("twitch"),
      userId: z.string().uuid(),
      channelId: z.string().trim().min(1),
      streamId: z.string().trim().min(1),
      startedAt: z.string().datetime(),
      enqueuedAt: z.string().datetime().optional(),
      receivedAt: z.string().datetime().optional(),
      vodLookupAttempt: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("NEW_VIDEO_PUBLISHED"),
      provider: z.literal("youtube"),
      userId: z.string().uuid(),
      channelId: z.string().trim().min(1),
      videoId: z.string().trim().min(1),
      title: z.string().trim().optional(),
      publishedAt: z.string().datetime().optional(),
      enqueuedAt: z.string().datetime(),
    }),
    z.object({
      type: z.literal("video.published"),
      provider: z.literal("youtube"),
      userId: z.string().uuid(),
      channelId: z.string().trim().min(1),
      videoId: z.string().trim().min(1),
      title: z.string().trim().optional(),
      publishedAt: z.string().datetime().optional(),
      enqueuedAt: z.string().datetime().optional(),
      receivedAt: z.string().datetime().optional(),
    }),
  ])
  .transform((payload) => {
    if (payload.type === "stream.online") {
      return {
        ...payload,
        type: "STREAM_ONLINE" as const,
        enqueuedAt: payload.enqueuedAt ?? payload.receivedAt,
      };
    }

    if (payload.type === "video.published") {
      return {
        ...payload,
        type: "NEW_VIDEO_PUBLISHED" as const,
        enqueuedAt: payload.enqueuedAt ?? payload.receivedAt,
      };
    }

    return payload;
  })
  .pipe(
    z.union([
      z.object({
        type: z.literal("STREAM_ONLINE"),
        provider: z.literal("twitch"),
        userId: z.string().uuid(),
        channelId: z.string().trim().min(1),
        streamId: z.string().trim().min(1),
        startedAt: z.string().datetime(),
        enqueuedAt: z.string().datetime(),
        vodLookupAttempt: z.number().int().min(0).optional(),
      }),
      z.object({
        type: z.literal("NEW_VIDEO_PUBLISHED"),
        provider: z.literal("youtube"),
        userId: z.string().uuid(),
        channelId: z.string().trim().min(1),
        videoId: z.string().trim().min(1),
        title: z.string().trim().optional(),
        publishedAt: z.string().datetime().optional(),
        enqueuedAt: z.string().datetime(),
      }),
    ]),
  );

export type MediaJobPayload = z.infer<typeof mediaJobPayloadSchema>;
export type StreamOnlinePayload = Extract<
  MediaJobPayload,
  { type: "STREAM_ONLINE" }
>;
export type NewVideoPublishedPayload = Extract<
  MediaJobPayload,
  { type: "NEW_VIDEO_PUBLISHED" }
>;
