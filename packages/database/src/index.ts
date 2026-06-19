export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ContentJobStatus =
  | "cancelled"
  | "completed"
  | "done"
  | "failed"
  | "pending"
  | "processing"
  | "running";
export type ContentJobType =
  | "transcription"
  | "repurposing"
  | "clip_scoring"
  | "title_generation";
export type ContentJobReviewStatus =
  | "needs_review"
  | "approved"
  | "rejected"
  | "needs_changes";
export type ContentPublicationStatus =
  | "requested"
  | "validated"
  | "queued"
  | "publishing"
  | "published"
  | "failed_retryable"
  | "failed_permanent"
  | "canceled"
  | "rejected";
export type ContentPublicationEventType =
  | "requested"
  | "validated"
  | "rejected"
  | "canceled"
  | "queued"
  | "publishing"
  | "published"
  | "failed_retryable"
  | "failed_permanent";
export type VodAssetStatus =
  | "ingested"
  | "transcribing"
  | "transcribed"
  | "failed";
export type StreamHighlightSource = "transcript" | "clip_scoring" | "manual";
export type ClipStatus =
  | "pending"
  | "draft"
  | "queued"
  | "rendering"
  | "ready"
  | "failed"
  | "published";
export type ClipExportStatus = Exclude<ClipStatus, "pending">;
export type BrandAssetType =
  | "overlay"
  | "alert"
  | "logo"
  | "banner"
  | "panel"
  | "emote"
  | "color_palette"
  | "typography"
  | "scene";
export type BrandAssetStatus = "draft" | "active" | "archived";
export type MonetizationEventType =
  | "subscription"
  | "membership"
  | "tip"
  | "donation"
  | "bits"
  | "ad_revenue"
  | "merch_sale"
  | "sponsorship"
  | "affiliate"
  | "other";
export type MonetizationEventStatus =
  | "pending"
  | "confirmed"
  | "void"
  | "disputed"
  | "refunded"
  | "failed";
export type MonetizationSummaryPeriod = "daily" | "weekly";

export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          user_id: string;
          email: string | null;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email?: string | null;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string | null;
          display_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      creators: {
        Row: {
          id: string;
          user_id: string;
          email: string | null;
          display_name: string;
          avatar_url: string | null;
          bio: string | null;
          handle: string | null;
          niche: string | null;
          primary_language: "DE" | "EN" | "Other";
          onboarding_step: number;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email?: string | null;
          display_name: string;
          avatar_url?: string | null;
          bio?: string | null;
          handle?: string | null;
          niche?: string | null;
          primary_language?: "DE" | "EN" | "Other";
          onboarding_step?: number;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string | null;
          display_name?: string;
          avatar_url?: string | null;
          bio?: string | null;
          handle?: string | null;
          niche?: string | null;
          primary_language?: "DE" | "EN" | "Other";
          onboarding_step?: number;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      channels: {
        Row: {
          id: string;
          user_id: string;
          creator_id: string;
          platform: Database["public"]["Enums"]["stream_platform"];
          external_post_id: string | null;
          display_name: string;
          follower_count: number;
          connected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          creator_id: string;
          platform: Database["public"]["Enums"]["stream_platform"];
          external_channel_id?: string | null;
          display_name: string;
          follower_count?: number;
          connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          creator_id?: string;
          platform?: Database["public"]["Enums"]["stream_platform"];
          external_channel_id?: string | null;
          display_name?: string;
          follower_count?: number;
          connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "channels_creator_user_fkey";
            columns: ["creator_id", "user_id"];
            referencedRelation: "creators";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      streams: {
        Row: {
          id: string;
          user_id: string;
          channel_id: string;
          provider: Database["public"]["Enums"]["stream_platform"];
          stream_id: string;
          platform_stream_id: string;
          started_at: string | null;
          ended_at: string | null;
          title: string | null;
          game_name: string | null;
          viewer_peak: number | null;
          status: string;
          peak_viewers: number | null;
          average_viewers: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel_id: string;
          provider?: Database["public"]["Enums"]["stream_platform"];
          stream_id?: string;
          platform_stream_id: string;
          started_at?: string | null;
          ended_at?: string | null;
          title?: string | null;
          game_name?: string | null;
          viewer_peak?: number | null;
          status?: string;
          peak_viewers?: number | null;
          average_viewers?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          channel_id?: string;
          provider?: Database["public"]["Enums"]["stream_platform"];
          stream_id?: string;
          platform_stream_id?: string;
          started_at?: string | null;
          ended_at?: string | null;
          title?: string | null;
          game_name?: string | null;
          viewer_peak?: number | null;
          status?: string;
          peak_viewers?: number | null;
          average_viewers?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "streams_channel_user_fkey";
            columns: ["channel_id", "user_id"];
            referencedRelation: "channels";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      platform_connections: {
        Row: {
          id: string;
          user_id: string;
          creator_id: string;
          channel_id: string | null;
          platform: Database["public"]["Enums"]["stream_platform"];
          provider_account_id: string;
          provider_profile: Json;
          metadata: Json;
          access_token_ciphertext: string | null;
          refresh_token_ciphertext: string | null;
          scopes: string[];
          expires_at: string | null;
          connected_at: string;
          status: Database["public"]["Enums"]["connection_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          creator_id: string;
          channel_id?: string | null;
          platform: Database["public"]["Enums"]["stream_platform"];
          provider_account_id: string;
          provider_profile?: Json;
          metadata?: Json;
          access_token_ciphertext?: string | null;
          refresh_token_ciphertext?: string | null;
          scopes?: string[];
          expires_at?: string | null;
          connected_at?: string;
          status?: Database["public"]["Enums"]["connection_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          creator_id?: string;
          channel_id?: string | null;
          platform?: Database["public"]["Enums"]["stream_platform"];
          provider_account_id?: string;
          provider_profile?: Json;
          metadata?: Json;
          access_token_ciphertext?: string | null;
          refresh_token_ciphertext?: string | null;
          scopes?: string[];
          expires_at?: string | null;
          connected_at?: string;
          status?: Database["public"]["Enums"]["connection_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_connections_channel_user_fkey";
            columns: ["channel_id", "user_id"];
            referencedRelation: "channels";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "platform_connections_creator_user_fkey";
            columns: ["creator_id", "user_id"];
            referencedRelation: "creators";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      youtube_websub_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          channel_connection_id: string;
          youtube_channel_id: string;
          topic_url: string;
          status: string;
          lease_seconds: number;
          subscribed_at: string;
          expires_at: string;
          last_renewed_at: string | null;
          failed_renewals: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel_connection_id: string;
          youtube_channel_id: string;
          topic_url: string;
          status?: string;
          lease_seconds: number;
          subscribed_at?: string;
          expires_at: string;
          last_renewed_at?: string | null;
          failed_renewals?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          channel_connection_id?: string;
          youtube_channel_id?: string;
          topic_url?: string;
          status?: string;
          lease_seconds?: number;
          subscribed_at?: string;
          expires_at?: string;
          last_renewed_at?: string | null;
          failed_renewals?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "youtube_websub_subscriptions_connection_user_fkey";
            columns: ["channel_connection_id", "user_id"];
            referencedRelation: "platform_connections";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      metrics_snapshots: {
        Row: {
          id: string;
          user_id: string;
          creator_id: string;
          channel_id: string;
          platform: Database["public"]["Enums"]["stream_platform"];
          captured_at: string;
          captured_hour: string;
          viewer_count: number;
          follower_count: number;
          watch_time_minutes: number;
          revenue_cents: number;
          engagement_rate: number | null;
          raw_payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          creator_id: string;
          channel_id: string;
          platform: Database["public"]["Enums"]["stream_platform"];
          captured_at?: string;
          captured_hour?: string;
          viewer_count?: number;
          follower_count?: number;
          watch_time_minutes?: number;
          revenue_cents?: number;
          engagement_rate?: number | null;
          raw_payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          creator_id?: string;
          channel_id?: string;
          platform?: Database["public"]["Enums"]["stream_platform"];
          captured_at?: string;
          captured_hour?: string;
          viewer_count?: number;
          follower_count?: number;
          watch_time_minutes?: number;
          revenue_cents?: number;
          engagement_rate?: number | null;
          raw_payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metrics_snapshots_channel_user_fkey";
            columns: ["channel_id", "user_id"];
            referencedRelation: "channels";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "metrics_snapshots_creator_user_fkey";
            columns: ["creator_id", "user_id"];
            referencedRelation: "creators";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      content_jobs: {
        Row: {
          id: string;
          user_id: string;
          stream_id: string | null;
          channel_id: string | null;
          queue_job_id: string | null;
          job_type: ContentJobType;
          type: ContentJobType;
          status: ContentJobStatus;
          review_status: ContentJobReviewStatus;
          reviewer_notes: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
          payload: Json;
          result: Json | null;
          error_message: string | null;
          retry_count: number;
          max_retries: number;
          last_retried_at: string | null;
          next_retry_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stream_id?: string | null;
          channel_id?: string | null;
          queue_job_id?: string | null;
          job_type: ContentJobType;
          type?: ContentJobType;
          status?: ContentJobStatus;
          review_status?: ContentJobReviewStatus;
          reviewer_notes?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          payload?: Json;
          result?: Json | null;
          error_message?: string | null;
          retry_count?: number;
          max_retries?: number;
          last_retried_at?: string | null;
          next_retry_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stream_id?: string | null;
          channel_id?: string | null;
          queue_job_id?: string | null;
          job_type?: ContentJobType;
          type?: ContentJobType;
          status?: ContentJobStatus;
          review_status?: ContentJobReviewStatus;
          reviewer_notes?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          payload?: Json;
          result?: Json | null;
          error_message?: string | null;
          retry_count?: number;
          max_retries?: number;
          last_retried_at?: string | null;
          next_retry_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_jobs_channel_user_fkey";
            columns: ["channel_id", "user_id"];
            referencedRelation: "channels";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "content_jobs_stream_user_fkey";
            columns: ["stream_id", "user_id"];
            referencedRelation: "streams";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      content_job_review_events: {
        Row: {
          content_job_id: string;
          created_at: string;
          id: string;
          previous_review_status: ContentJobReviewStatus | null;
          review_status: ContentJobReviewStatus;
          reviewed_at: string;
          reviewed_by: string | null;
          reviewer_notes: string;
          user_id: string;
        };
        Insert: {
          content_job_id: string;
          created_at?: string;
          id?: string;
          previous_review_status?: ContentJobReviewStatus | null;
          review_status: ContentJobReviewStatus;
          reviewed_at?: string;
          reviewed_by?: string | null;
          reviewer_notes?: string;
          user_id: string;
        };
        Update: {
          content_job_id?: string;
          created_at?: string;
          id?: string;
          previous_review_status?: ContentJobReviewStatus | null;
          review_status?: ContentJobReviewStatus;
          reviewed_at?: string;
          reviewed_by?: string | null;
          reviewer_notes?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_job_review_events_content_job_user_fkey";
            columns: ["content_job_id", "user_id"];
            referencedRelation: "content_jobs";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      content_job_export_events: {
        Row: {
          actor_id: string;
          bundle_hash: string | null;
          content_job_id: string;
          created_at: string;
          event_type: "copy_bundle" | "copy_template";
          id: string;
          metadata: Json;
          review_status_at_export: ContentJobReviewStatus;
          source: string;
          target_platform: "tiktok" | "youtube_shorts";
          template_key: "bundle" | "tiktok" | "youtube_shorts";
          user_id: string;
        };
        Insert: {
          actor_id: string;
          bundle_hash?: string | null;
          content_job_id: string;
          created_at?: string;
          event_type: "copy_bundle" | "copy_template";
          id?: string;
          metadata?: Json;
          review_status_at_export: ContentJobReviewStatus;
          source?: string;
          target_platform: "tiktok" | "youtube_shorts";
          template_key: "bundle" | "tiktok" | "youtube_shorts";
          user_id: string;
        };
        Update: {
          actor_id?: string;
          bundle_hash?: string | null;
          content_job_id?: string;
          created_at?: string;
          event_type?: "copy_bundle" | "copy_template";
          id?: string;
          metadata?: Json;
          review_status_at_export?: ContentJobReviewStatus;
          source?: string;
          target_platform?: "tiktok" | "youtube_shorts";
          template_key?: "bundle" | "tiktok" | "youtube_shorts";
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_job_export_events_content_job_user_fkey";
            columns: ["content_job_id", "user_id"];
            referencedRelation: "content_jobs";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      content_publications: {
        Row: {
          content_job_id: string;
          created_at: string;
          external_post_id: string | null;
          external_url: string | null;
          id: string;
          max_retries: number;
          next_retry_at: string | null;
          platform_connection_id: string;
          published_at: string | null;
          publication_status: ContentPublicationStatus;
          request_intent_hash: string;
          requested_at: string;
          requested_by: string;
          retry_count: number;
          review_status_at_request: ContentJobReviewStatus;
          snapshot: Json;
          snapshot_hash: string;
          target_platform: Database["public"]["Enums"]["stream_platform"];
          updated_at: string;
          user_id: string;
          validated_at: string | null;
          validation_code: string | null;
          validation_message: string | null;
          validation_metadata: Json;
        };
        Insert: {
          content_job_id: string;
          created_at?: string;
          external_post_id?: string | null;
          external_url?: string | null;
          id?: string;
          max_retries?: number;
          next_retry_at?: string | null;
          platform_connection_id: string;
          published_at?: string | null;
          publication_status?: ContentPublicationStatus;
          request_intent_hash: string;
          requested_at?: string;
          requested_by: string;
          retry_count?: number;
          review_status_at_request: ContentJobReviewStatus;
          snapshot?: Json;
          snapshot_hash: string;
          target_platform: Database["public"]["Enums"]["stream_platform"];
          updated_at?: string;
          user_id: string;
          validated_at?: string | null;
          validation_code?: string | null;
          validation_message?: string | null;
          validation_metadata?: Json;
        };
        Update: {
          content_job_id?: string;
          created_at?: string;
          external_post_id?: string | null;
          external_url?: string | null;
          id?: string;
          max_retries?: number;
          next_retry_at?: string | null;
          platform_connection_id?: string;
          published_at?: string | null;
          publication_status?: ContentPublicationStatus;
          request_intent_hash?: string;
          requested_at?: string;
          requested_by?: string;
          retry_count?: number;
          review_status_at_request?: ContentJobReviewStatus;
          snapshot?: Json;
          snapshot_hash?: string;
          target_platform?: Database["public"]["Enums"]["stream_platform"];
          updated_at?: string;
          user_id?: string;
          validated_at?: string | null;
          validation_code?: string | null;
          validation_message?: string | null;
          validation_metadata?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "content_publications_content_job_user_fkey";
            columns: ["content_job_id", "user_id"];
            referencedRelation: "content_jobs";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "content_publications_connection_user_fkey";
            columns: ["platform_connection_id", "user_id"];
            referencedRelation: "platform_connections";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      content_publication_events: {
        Row: {
          actor_id: string;
          content_publication_id: string;
          created_at: string;
          event_type: ContentPublicationEventType;
          id: string;
          metadata: Json;
          previous_publication_status: ContentPublicationStatus | null;
          publication_status: ContentPublicationStatus;
          source: string;
          user_id: string;
        };
        Insert: {
          actor_id: string;
          content_publication_id: string;
          created_at?: string;
          event_type: ContentPublicationEventType;
          id?: string;
          metadata?: Json;
          previous_publication_status?: ContentPublicationStatus | null;
          publication_status: ContentPublicationStatus;
          source?: string;
          user_id: string;
        };
        Update: {
          actor_id?: string;
          content_publication_id?: string;
          created_at?: string;
          event_type?: ContentPublicationEventType;
          id?: string;
          metadata?: Json;
          previous_publication_status?: ContentPublicationStatus | null;
          publication_status?: ContentPublicationStatus;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_publication_events_publication_user_fkey";
            columns: ["content_publication_id", "user_id"];
            referencedRelation: "content_publications";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      vod_assets: {
        Row: {
          id: string;
          user_id: string;
          stream_id: string;
          platform: Database["public"]["Enums"]["stream_platform"];
          source_url: string;
          external_post_id: string | null;
          status: VodAssetStatus;
          duration_seconds: number | null;
          ingested_at: string;
          transcribed_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stream_id: string;
          platform: Database["public"]["Enums"]["stream_platform"];
          source_url: string;
          external_asset_id?: string | null;
          status?: VodAssetStatus;
          duration_seconds?: number | null;
          ingested_at?: string;
          transcribed_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stream_id?: string;
          platform?: Database["public"]["Enums"]["stream_platform"];
          source_url?: string;
          external_asset_id?: string | null;
          status?: VodAssetStatus;
          duration_seconds?: number | null;
          ingested_at?: string;
          transcribed_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vod_assets_stream_user_fkey";
            columns: ["stream_id", "user_id"];
            referencedRelation: "streams";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      stream_transcripts: {
        Row: {
          id: string;
          user_id: string;
          stream_id: string;
          vod_asset_id: string | null;
          language: string;
          provider: string;
          model: string;
          transcript_text: string;
          segments: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stream_id: string;
          vod_asset_id?: string | null;
          language?: string;
          provider: string;
          model: string;
          transcript_text: string;
          segments?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stream_id?: string;
          vod_asset_id?: string | null;
          language?: string;
          provider?: string;
          model?: string;
          transcript_text?: string;
          segments?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stream_transcripts_stream_user_fkey";
            columns: ["stream_id", "user_id"];
            referencedRelation: "streams";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "stream_transcripts_vod_asset_user_fkey";
            columns: ["vod_asset_id", "user_id"];
            referencedRelation: "vod_assets";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      stream_highlights: {
        Row: {
          id: string;
          user_id: string;
          stream_id: string;
          transcript_id: string | null;
          source_queue_job_id: string | null;
          source: StreamHighlightSource;
          rank: number;
          score: number | null;
          title: string | null;
          summary: string;
          source_start_seconds: number | null;
          source_end_seconds: number | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stream_id: string;
          transcript_id?: string | null;
          source_queue_job_id?: string | null;
          source: StreamHighlightSource;
          rank?: number;
          score?: number | null;
          title?: string | null;
          summary: string;
          source_start_seconds?: number | null;
          source_end_seconds?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stream_id?: string;
          transcript_id?: string | null;
          source_queue_job_id?: string | null;
          source?: StreamHighlightSource;
          rank?: number;
          score?: number | null;
          title?: string | null;
          summary?: string;
          source_start_seconds?: number | null;
          source_end_seconds?: number | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stream_highlights_stream_user_fkey";
            columns: ["stream_id", "user_id"];
            referencedRelation: "streams";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "stream_highlights_transcript_user_fkey";
            columns: ["transcript_id", "user_id"];
            referencedRelation: "stream_transcripts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      clips: {
        Row: {
          id: string;
          user_id: string;
          stream_id: string;
          highlight_id: string | null;
          source_queue_job_id: string | null;
          title: string;
          description: string | null;
          source_url: string | null;
          clip_url: string | null;
          thumbnail_url: string | null;
          source_start_seconds: number | null;
          source_end_seconds: number | null;
          virality_score: number | null;
          viral_score: number | null;
          duration_seconds: number | null;
          status: ClipStatus;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stream_id: string;
          highlight_id?: string | null;
          source_queue_job_id?: string | null;
          title: string;
          description?: string | null;
          source_url?: string | null;
          clip_url?: string | null;
          thumbnail_url?: string | null;
          source_start_seconds?: number | null;
          source_end_seconds?: number | null;
          virality_score?: number | null;
          viral_score?: number | null;
          duration_seconds?: number | null;
          status?: ClipStatus;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stream_id?: string;
          highlight_id?: string | null;
          source_queue_job_id?: string | null;
          title?: string;
          description?: string | null;
          source_url?: string | null;
          clip_url?: string | null;
          thumbnail_url?: string | null;
          source_start_seconds?: number | null;
          source_end_seconds?: number | null;
          virality_score?: number | null;
          viral_score?: number | null;
          duration_seconds?: number | null;
          status?: ClipStatus;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clips_stream_user_fkey";
            columns: ["stream_id", "user_id"];
            referencedRelation: "streams";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "clips_highlight_user_fkey";
            columns: ["highlight_id", "user_id"];
            referencedRelation: "stream_highlights";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      clip_exports: {
        Row: {
          id: string;
          user_id: string;
          clip_id: string;
          target_platform:
            | Database["public"]["Enums"]["stream_platform"]
            | null;
          export_format: string;
          status: ClipExportStatus;
          render_url: string | null;
          published_url: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          clip_id: string;
          target_platform?:
            | Database["public"]["Enums"]["stream_platform"]
            | null;
          export_format: string;
          status?: ClipExportStatus;
          render_url?: string | null;
          published_url?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          clip_id?: string;
          target_platform?:
            | Database["public"]["Enums"]["stream_platform"]
            | null;
          export_format?: string;
          status?: ClipExportStatus;
          render_url?: string | null;
          published_url?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clip_exports_clip_user_fkey";
            columns: ["clip_id", "user_id"];
            referencedRelation: "clips";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      brand_assets: {
        Row: {
          id: string;
          user_id: string;
          creator_id: string | null;
          channel_id: string | null;
          asset_type: BrandAssetType;
          status: BrandAssetStatus;
          name: string;
          description: string | null;
          storage_bucket: string | null;
          storage_path: string | null;
          public_url: string | null;
          config: Json;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          creator_id?: string | null;
          channel_id?: string | null;
          asset_type: BrandAssetType;
          status?: BrandAssetStatus;
          name: string;
          description?: string | null;
          storage_bucket?: string | null;
          storage_path?: string | null;
          public_url?: string | null;
          config?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          creator_id?: string | null;
          channel_id?: string | null;
          asset_type?: BrandAssetType;
          status?: BrandAssetStatus;
          name?: string;
          description?: string | null;
          storage_bucket?: string | null;
          storage_path?: string | null;
          public_url?: string | null;
          config?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brand_assets_creator_user_fkey";
            columns: ["creator_id", "user_id"];
            referencedRelation: "creators";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "brand_assets_channel_user_fkey";
            columns: ["channel_id", "user_id"];
            referencedRelation: "channels";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      monetization_events: {
        Row: {
          id: string;
          user_id: string;
          creator_id: string | null;
          channel_id: string;
          stream_id: string | null;
          platform: Database["public"]["Enums"]["stream_platform"] | null;
          provider: Database["public"]["Enums"]["stream_platform"];
          event_type: MonetizationEventType;
          status: MonetizationEventStatus;
          source: string;
          external_post_id: string | null;
          provider_event_id: string | null;
          raw_event_id: string | null;
          raw_payload: Json;
          attribution: Json;
          amount_cents: number;
          currency: string;
          quantity: number;
          payer_handle: string | null;
          sponsor_name: string | null;
          occurred_at: string;
          ingested_at: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          creator_id?: string | null;
          channel_id: string;
          stream_id?: string | null;
          platform?: Database["public"]["Enums"]["stream_platform"] | null;
          provider: Database["public"]["Enums"]["stream_platform"];
          event_type: MonetizationEventType;
          status?: MonetizationEventStatus;
          source: string;
          external_event_id?: string | null;
          provider_event_id?: string | null;
          raw_event_id?: string | null;
          raw_payload?: Json;
          attribution?: Json;
          amount_cents: number;
          currency?: string;
          quantity?: number;
          payer_handle?: string | null;
          sponsor_name?: string | null;
          occurred_at?: string;
          ingested_at?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          creator_id?: string | null;
          channel_id?: string;
          stream_id?: string | null;
          platform?: Database["public"]["Enums"]["stream_platform"] | null;
          provider?: Database["public"]["Enums"]["stream_platform"];
          event_type?: MonetizationEventType;
          status?: MonetizationEventStatus;
          source?: string;
          external_event_id?: string | null;
          provider_event_id?: string | null;
          raw_event_id?: string | null;
          raw_payload?: Json;
          attribution?: Json;
          amount_cents?: number;
          currency?: string;
          quantity?: number;
          payer_handle?: string | null;
          sponsor_name?: string | null;
          occurred_at?: string;
          ingested_at?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monetization_events_creator_user_fkey";
            columns: ["creator_id", "user_id"];
            referencedRelation: "creators";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "monetization_events_channel_user_fkey";
            columns: ["channel_id", "user_id"];
            referencedRelation: "channels";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "monetization_events_stream_user_fkey";
            columns: ["stream_id", "user_id"];
            referencedRelation: "streams";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      monetization_summaries: {
        Row: {
          id: string;
          user_id: string;
          creator_id: string | null;
          channel_id: string;
          provider: Database["public"]["Enums"]["stream_platform"];
          period: MonetizationSummaryPeriod;
          period_start: string;
          period_end: string;
          currency: string;
          gross_amount_cents: number;
          net_amount_cents: number;
          event_count: number;
          subscription_count: number;
          tip_count: number;
          donation_count: number;
          ad_revenue_count: number;
          sponsorship_count: number;
          merch_sale_count: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          creator_id?: string | null;
          channel_id: string;
          provider: Database["public"]["Enums"]["stream_platform"];
          period: MonetizationSummaryPeriod;
          period_start: string;
          period_end: string;
          currency?: string;
          gross_amount_cents?: number;
          net_amount_cents?: number;
          event_count?: number;
          subscription_count?: number;
          tip_count?: number;
          donation_count?: number;
          ad_revenue_count?: number;
          sponsorship_count?: number;
          merch_sale_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          creator_id?: string | null;
          channel_id?: string;
          provider?: Database["public"]["Enums"]["stream_platform"];
          period?: MonetizationSummaryPeriod;
          period_start?: string;
          period_end?: string;
          currency?: string;
          gross_amount_cents?: number;
          net_amount_cents?: number;
          event_count?: number;
          subscription_count?: number;
          tip_count?: number;
          donation_count?: number;
          ad_revenue_count?: number;
          sponsorship_count?: number;
          merch_sale_count?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monetization_summaries_creator_user_fkey";
            columns: ["creator_id", "user_id"];
            referencedRelation: "creators";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "monetization_summaries_channel_user_fkey";
            columns: ["channel_id", "user_id"];
            referencedRelation: "channels";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_monetization_dashboard: {
        Args: {
          p_period: string;
        };
        Returns: Json;
      };
      record_content_publication_request: {
        Args: {
          p_content_job_id: string;
          p_platform_connection_id: string;
          p_target_platform: Database["public"]["Enums"]["stream_platform"];
          p_user_id: string;
          p_requested_by: string;
          p_snapshot: Json;
          p_request_intent_hash: string;
          p_snapshot_hash: string;
          p_validation_code?: string;
          p_validation_message?: string | null;
          p_validation_metadata?: Json;
          p_requested_at?: string;
        };
        Returns: Database["public"]["Tables"]["content_publications"]["Row"];
      };
    };
    Enums: {
      connection_status:
        | "connected"
        | "degraded"
        | "disconnected"
        | "expired"
        | "pending"
        | "revoked";
      stream_platform: "twitch" | "youtube" | "tiktok" | "kick";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Inserts<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Updates<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
