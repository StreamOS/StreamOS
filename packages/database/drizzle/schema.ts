import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ContentJobStatus, ContentJobType, Json } from "../src/index.js";

export const streamPlatform = pgEnum("stream_platform", [
  "twitch",
  "youtube",
  "tiktok",
  "kick",
]);

export const connectionStatus = pgEnum("connection_status", [
  "connected",
  "degraded",
  "disconnected",
  "expired",
  "pending",
  "revoked",
]);

const timestampWithTimezone = (name: string) =>
  timestamp(name, {
    mode: "string",
    withTimezone: true,
  });

export const creators = pgTable(
  "creators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    email: text("email"),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    handle: text("handle"),
    niche: text("niche"),
    primaryLanguage: text("primary_language")
      .$type<"DE" | "EN" | "Other">()
      .notNull()
      .default("EN"),
    onboardingStep: integer("onboarding_step").notNull().default(0),
    onboardingCompleted: boolean("onboarding_completed")
      .notNull()
      .default(false),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("creators_user_id_idx").on(table.userId),
    idUserIdUnique: uniqueIndex("creators_id_user_id_unique").on(
      table.id,
      table.userId,
    ),
  }),
);

export const channels = pgTable(
  "channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    creatorId: uuid("creator_id").notNull(),
    platform: streamPlatform("platform").notNull(),
    externalChannelId: text("external_channel_id"),
    displayName: text("display_name").notNull(),
    followerCount: integer("follower_count").notNull().default(0),
    connectedAt: timestampWithTimezone("connected_at"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userCreatorIdx: index("channels_user_creator_idx").on(
      table.userId,
      table.creatorId,
    ),
    userPlatformIdx: index("channels_user_platform_idx").on(
      table.userId,
      table.platform,
    ),
    creatorPlatformExternalUnique: uniqueIndex(
      "channels_creator_platform_external_unique",
    ).on(table.creatorId, table.platform, table.externalChannelId),
    idUserIdUnique: uniqueIndex("channels_id_user_id_unique").on(
      table.id,
      table.userId,
    ),
  }),
);

export const streams = pgTable(
  "streams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    channelId: uuid("channel_id").notNull(),
    provider: streamPlatform("provider").notNull().default("twitch"),
    streamId: text("stream_id").notNull().default(""),
    platformStreamId: text("platform_stream_id").notNull(),
    startedAt: timestampWithTimezone("started_at"),
    endedAt: timestampWithTimezone("ended_at"),
    title: text("title"),
    gameName: text("game_name"),
    viewerPeak: integer("viewer_peak"),
    status: text("status").notNull().default("offline"),
    peakViewers: integer("peak_viewers"),
    averageViewers: integer("average_viewers"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userChannelStartedIdx: index("streams_user_channel_started_idx").on(
      table.userId,
      table.channelId,
      table.startedAt,
    ),
    userPlatformStreamIdx: index("streams_user_platform_stream_idx").on(
      table.userId,
      table.platformStreamId,
    ),
    idUserIdUnique: uniqueIndex("streams_id_user_id_unique").on(
      table.id,
      table.userId,
    ),
  }),
);

export const contentJobs = pgTable(
  "content_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    streamId: uuid("stream_id"),
    channelId: uuid("channel_id"),
    queueJobId: text("queue_job_id"),
    jobType: text("job_type").$type<ContentJobType>().notNull(),
    type: text("type").$type<ContentJobType>().notNull(),
    status: text("status")
      .$type<ContentJobStatus>()
      .notNull()
      .default("pending"),
    payload: jsonb("payload")
      .$type<Json>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    result: jsonb("result").$type<Json>(),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    lastRetriedAt: timestampWithTimezone("last_retried_at"),
    nextRetryAt: timestampWithTimezone("next_retry_at"),
    startedAt: timestampWithTimezone("started_at"),
    completedAt: timestampWithTimezone("completed_at"),
    createdAt: timestampWithTimezone("created_at").notNull().defaultNow(),
    updatedAt: timestampWithTimezone("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userStreamCreatedIdx: index("content_jobs_user_stream_created_idx").on(
      table.userId,
      table.streamId,
      table.createdAt,
    ),
    userStatusUpdatedIdx: index("content_jobs_user_status_updated_idx").on(
      table.userId,
      table.status,
      table.updatedAt,
    ),
    userTypeStatusIdx: index("content_jobs_user_type_status_idx").on(
      table.userId,
      table.type,
      table.status,
      table.updatedAt,
    ),
    idUserIdUnique: uniqueIndex("content_jobs_id_user_id_unique").on(
      table.id,
      table.userId,
    ),
    queueJobIdUnique: uniqueIndex("content_jobs_queue_job_id_key").on(
      table.queueJobId,
    ),
  }),
);
