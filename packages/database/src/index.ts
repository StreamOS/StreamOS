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
  | "schedule_blocked"
  | "schedule_canceled"
  | "schedule_created"
  | "schedule_expired"
  | "schedule_replaced"
  | "schedule_updated"
  | "schedule_validation_failed"
  | "queued"
  | "publishing"
  | "published"
  | "failed_retryable"
  | "failed_permanent"
  | "reconcile_requested"
  | "reconcile_skipped"
  | "reconcile_failed_retryable"
  | "reconcile_failed_permanent"
  | "reconciled";
export type ContentPublicationFanoutStatus =
  | "blocked"
  | "canceled"
  | "partially_validated"
  | "requested"
  | "validated";
export type ContentPublicationFanoutTargetStatus = "blocked" | "validated";
export type ContentPublicationFanoutEventType =
  | "child_retry_queued"
  | "child_retry_requested"
  | "fanout_blocked"
  | "fanout_requested"
  | "fanout_schedule_blocked"
  | "fanout_schedule_canceled"
  | "fanout_schedule_created"
  | "fanout_schedule_expired"
  | "fanout_schedule_replaced"
  | "fanout_schedule_updated"
  | "fanout_schedule_validation_failed"
  | "fanout_target_schedule_blocked"
  | "fanout_target_schedule_inherited"
  | "fanout_validated"
  | "manual_action_blocked"
  | "parent_aggregate_refreshed"
  | "target_rechecked";
export type ContentPublicationScheduleStatus =
  | "not_scheduled"
  | "scheduled"
  | "schedule_blocked"
  | "schedule_expired"
  | "schedule_canceled"
  | "schedule_replaced"
  | "schedule_ready"
  | "schedule_unknown";
export type ContentPublicationScheduleSource =
  | "api-gateway"
  | "dashboard"
  | "manual"
  | "system";
export type ContentPublicationScheduleBlockReason =
  | "child_not_part_of_parent"
  | "content_job_not_approved"
  | "content_job_not_complete"
  | "fanout_finalized"
  | "fanout_not_ready"
  | "missing_publish_scopes"
  | "platform_connection_missing"
  | "platform_connection_not_connected"
  | "publication_finalized"
  | "publication_processing"
  | "publication_reauth_required"
  | "publication_status_not_schedulable"
  | "publishable_asset_missing"
  | "publishable_bundle_missing"
  | "schedule_time_invalid"
  | "schedule_timezone_invalid"
  | "scheduling_not_allowed"
  | "target_unsupported"
  | "tenant_mismatch";
export type PublicationFanoutPolicy =
  | "all_or_nothing_preflight"
  | "prepare_valid_targets";
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
          capability_snapshot: Json;
          capability_version: string;
          content_job_id: string;
          created_at: string;
          desired_visibility: string;
          effective_visibility: string | null;
          external_post_id: string | null;
          external_url: string | null;
          id: string;
          last_reconciled_at: string | null;
          max_retries: number;
          next_retry_at: string | null;
          scheduled_at_utc: string | null;
          scheduled_timezone: string | null;
          schedule_block_message: string | null;
          schedule_block_reason: ContentPublicationScheduleBlockReason | null;
          schedule_canceled_at: string | null;
          schedule_canceled_reason: string | null;
          schedule_capability_snapshot: Json;
          schedule_created_at: string | null;
          schedule_expired_at: string | null;
          schedule_replaced_at: string | null;
          schedule_source: ContentPublicationScheduleSource | null;
          schedule_status: ContentPublicationScheduleStatus;
          schedule_updated_at: string | null;
          schedule_validation_metadata: Json;
          platform_connection_id: string;
          published_at: string | null;
          publication_status: ContentPublicationStatus;
          provider_failure_code: string | null;
          provider_failure_metadata: Json;
          provider_failure_reason: string | null;
          request_intent_hash: string;
          requested_at: string;
          requested_by: string;
          provider_overrides: Json;
          reconciliation_status: string;
          reconcile_max_retries: number;
          reconcile_next_retry_at: string | null;
          reconcile_retry_count: number;
          retry_count: number;
          review_status_at_request: ContentJobReviewStatus;
          snapshot: Json;
          snapshot_hash: string;
          remote_processing_status: string | null;
          remote_state: Json;
          remote_status: string;
          remote_upload_status: string | null;
          target_platform: Database["public"]["Enums"]["stream_platform"];
          updated_at: string;
          user_id: string;
          validated_at: string | null;
          validation_code: string | null;
          validation_message: string | null;
          validation_metadata: Json;
        };
        Insert: {
          capability_snapshot?: Json;
          capability_version?: string;
          content_job_id: string;
          created_at?: string;
          desired_visibility?: string;
          effective_visibility?: string | null;
          external_post_id?: string | null;
          external_url?: string | null;
          id?: string;
          last_reconciled_at?: string | null;
          max_retries?: number;
          next_retry_at?: string | null;
          scheduled_at_utc?: string | null;
          scheduled_timezone?: string | null;
          schedule_block_message?: string | null;
          schedule_block_reason?: ContentPublicationScheduleBlockReason | null;
          schedule_canceled_at?: string | null;
          schedule_canceled_reason?: string | null;
          schedule_capability_snapshot?: Json;
          schedule_created_at?: string | null;
          schedule_expired_at?: string | null;
          schedule_replaced_at?: string | null;
          schedule_source?: ContentPublicationScheduleSource | null;
          schedule_status?: ContentPublicationScheduleStatus;
          schedule_updated_at?: string | null;
          schedule_validation_metadata?: Json;
          platform_connection_id: string;
          published_at?: string | null;
          publication_status?: ContentPublicationStatus;
          provider_failure_code?: string | null;
          provider_failure_metadata?: Json;
          provider_failure_reason?: string | null;
          request_intent_hash: string;
          requested_at?: string;
          requested_by: string;
          provider_overrides?: Json;
          reconciliation_status?: string;
          reconcile_max_retries?: number;
          reconcile_next_retry_at?: string | null;
          reconcile_retry_count?: number;
          retry_count?: number;
          review_status_at_request: ContentJobReviewStatus;
          snapshot?: Json;
          snapshot_hash: string;
          remote_processing_status?: string | null;
          remote_state?: Json;
          remote_status?: string;
          remote_upload_status?: string | null;
          target_platform: Database["public"]["Enums"]["stream_platform"];
          updated_at?: string;
          user_id: string;
          validated_at?: string | null;
          validation_code?: string | null;
          validation_message?: string | null;
          validation_metadata?: Json;
        };
        Update: {
          capability_snapshot?: Json;
          capability_version?: string;
          content_job_id?: string;
          created_at?: string;
          desired_visibility?: string;
          effective_visibility?: string | null;
          external_post_id?: string | null;
          external_url?: string | null;
          id?: string;
          last_reconciled_at?: string | null;
          max_retries?: number;
          next_retry_at?: string | null;
          scheduled_at_utc?: string | null;
          scheduled_timezone?: string | null;
          schedule_block_message?: string | null;
          schedule_block_reason?: ContentPublicationScheduleBlockReason | null;
          schedule_canceled_at?: string | null;
          schedule_canceled_reason?: string | null;
          schedule_capability_snapshot?: Json;
          schedule_created_at?: string | null;
          schedule_expired_at?: string | null;
          schedule_replaced_at?: string | null;
          schedule_source?: ContentPublicationScheduleSource | null;
          schedule_status?: ContentPublicationScheduleStatus;
          schedule_updated_at?: string | null;
          schedule_validation_metadata?: Json;
          platform_connection_id?: string;
          published_at?: string | null;
          publication_status?: ContentPublicationStatus;
          provider_failure_code?: string | null;
          provider_failure_metadata?: Json;
          provider_failure_reason?: string | null;
          request_intent_hash?: string;
          requested_at?: string;
          requested_by?: string;
          provider_overrides?: Json;
          reconciliation_status?: string;
          reconcile_max_retries?: number;
          reconcile_next_retry_at?: string | null;
          reconcile_retry_count?: number;
          retry_count?: number;
          review_status_at_request?: ContentJobReviewStatus;
          snapshot?: Json;
          snapshot_hash?: string;
          remote_processing_status?: string | null;
          remote_state?: Json;
          remote_status?: string;
          remote_upload_status?: string | null;
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
      content_publication_fanouts: {
        Row: {
          blocked_target_count: number;
          content_job_id: string;
          created_at: string;
          last_action_at: string | null;
          last_action_key: string | null;
          last_action_result: string | null;
          last_aggregate_refreshed_at: string | null;
          fanout_policy: PublicationFanoutPolicy;
          fanout_status: ContentPublicationFanoutStatus;
          id: string;
          scheduled_at_utc: string | null;
          scheduled_timezone: string | null;
          schedule_block_message: string | null;
          schedule_block_reason: ContentPublicationScheduleBlockReason | null;
          schedule_canceled_at: string | null;
          schedule_canceled_reason: string | null;
          schedule_capability_snapshot: Json;
          schedule_created_at: string | null;
          schedule_expired_at: string | null;
          schedule_replaced_at: string | null;
          schedule_source: ContentPublicationScheduleSource | null;
          schedule_status: ContentPublicationScheduleStatus;
          schedule_updated_at: string | null;
          schedule_validation_metadata: Json;
          requested_at: string;
          requested_by: string;
          request_intent_hash: string;
          review_status_at_request: ContentJobReviewStatus;
          snapshot: Json;
          snapshot_hash: string;
          target_count: number;
          updated_at: string;
          user_id: string;
          validated_at: string | null;
          validated_target_count: number;
        };
        Insert: {
          blocked_target_count?: number;
          content_job_id: string;
          created_at?: string;
          last_action_at?: string | null;
          last_action_key?: string | null;
          last_action_result?: string | null;
          last_aggregate_refreshed_at?: string | null;
          fanout_policy?: PublicationFanoutPolicy;
          fanout_status?: ContentPublicationFanoutStatus;
          id?: string;
          scheduled_at_utc?: string | null;
          scheduled_timezone?: string | null;
          schedule_block_message?: string | null;
          schedule_block_reason?: ContentPublicationScheduleBlockReason | null;
          schedule_canceled_at?: string | null;
          schedule_canceled_reason?: string | null;
          schedule_capability_snapshot?: Json;
          schedule_created_at?: string | null;
          schedule_expired_at?: string | null;
          schedule_replaced_at?: string | null;
          schedule_source?: ContentPublicationScheduleSource | null;
          schedule_status?: ContentPublicationScheduleStatus;
          schedule_updated_at?: string | null;
          schedule_validation_metadata?: Json;
          requested_at?: string;
          requested_by: string;
          request_intent_hash: string;
          review_status_at_request: ContentJobReviewStatus;
          snapshot?: Json;
          snapshot_hash: string;
          target_count?: number;
          updated_at?: string;
          user_id: string;
          validated_at?: string | null;
          validated_target_count?: number;
        };
        Update: {
          blocked_target_count?: number;
          content_job_id?: string;
          created_at?: string;
          last_action_at?: string | null;
          last_action_key?: string | null;
          last_action_result?: string | null;
          last_aggregate_refreshed_at?: string | null;
          fanout_policy?: PublicationFanoutPolicy;
          fanout_status?: ContentPublicationFanoutStatus;
          id?: string;
          scheduled_at_utc?: string | null;
          scheduled_timezone?: string | null;
          schedule_block_message?: string | null;
          schedule_block_reason?: ContentPublicationScheduleBlockReason | null;
          schedule_canceled_at?: string | null;
          schedule_canceled_reason?: string | null;
          schedule_capability_snapshot?: Json;
          schedule_created_at?: string | null;
          schedule_expired_at?: string | null;
          schedule_replaced_at?: string | null;
          schedule_source?: ContentPublicationScheduleSource | null;
          schedule_status?: ContentPublicationScheduleStatus;
          schedule_updated_at?: string | null;
          schedule_validation_metadata?: Json;
          requested_at?: string;
          requested_by?: string;
          request_intent_hash?: string;
          review_status_at_request?: ContentJobReviewStatus;
          snapshot?: Json;
          snapshot_hash?: string;
          target_count?: number;
          updated_at?: string;
          user_id?: string;
          validated_at?: string | null;
          validated_target_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "content_publication_fanouts_content_job_user_fkey";
            columns: ["content_job_id", "user_id"];
            referencedRelation: "content_jobs";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "content_publication_fanouts_requested_by_fkey";
            columns: ["requested_by"];
            referencedRelation: "auth.users";
            referencedColumns: ["id"];
          },
        ];
      };
      content_publication_fanout_targets: {
        Row: {
          block_message: string | null;
          block_reason: string | null;
          capability_snapshot: Json;
          capability_version: string;
          content_publication_fanout_id: string;
          content_publication_id: string | null;
          created_at: string;
          last_action_at: string | null;
          last_action_key: string | null;
          last_action_result: string | null;
          last_block_reason: string | null;
          last_rechecked_at: string | null;
          id: string;
          platform_connection_id: string;
          provider_overrides: Json;
          request_intent_hash: string;
          target_platform: Database["public"]["Enums"]["stream_platform"];
          target_status: ContentPublicationFanoutTargetStatus;
          updated_at: string;
          user_id: string;
          validated_at: string | null;
        };
        Insert: {
          block_message?: string | null;
          block_reason?: string | null;
          capability_snapshot?: Json;
          capability_version?: string;
          content_publication_fanout_id: string;
          content_publication_id?: string | null;
          created_at?: string;
          last_action_at?: string | null;
          last_action_key?: string | null;
          last_action_result?: string | null;
          last_block_reason?: string | null;
          last_rechecked_at?: string | null;
          id?: string;
          platform_connection_id: string;
          provider_overrides?: Json;
          request_intent_hash: string;
          target_platform: Database["public"]["Enums"]["stream_platform"];
          target_status: ContentPublicationFanoutTargetStatus;
          updated_at?: string;
          user_id: string;
          validated_at?: string | null;
        };
        Update: {
          block_message?: string | null;
          block_reason?: string | null;
          capability_snapshot?: Json;
          capability_version?: string;
          content_publication_fanout_id?: string;
          content_publication_id?: string | null;
          created_at?: string;
          last_action_at?: string | null;
          last_action_key?: string | null;
          last_action_result?: string | null;
          last_block_reason?: string | null;
          last_rechecked_at?: string | null;
          id?: string;
          platform_connection_id?: string;
          provider_overrides?: Json;
          request_intent_hash?: string;
          target_platform?: Database["public"]["Enums"]["stream_platform"];
          target_status?: ContentPublicationFanoutTargetStatus;
          updated_at?: string;
          user_id?: string;
          validated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_publication_fanout_targets_fanout_user_fkey";
            columns: ["content_publication_fanout_id", "user_id"];
            referencedRelation: "content_publication_fanouts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "content_publication_fanout_targets_publication_user_fkey";
            columns: ["content_publication_id", "user_id"];
            referencedRelation: "content_publications";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "content_publication_fanout_targets_connection_user_fkey";
            columns: ["platform_connection_id", "user_id"];
            referencedRelation: "platform_connections";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      content_publication_fanout_events: {
        Row: {
          action_key: string | null;
          action_result: string;
          actor_id: string;
          content_publication_fanout_id: string;
          content_publication_fanout_target_id: string | null;
          content_publication_id: string | null;
          created_at: string;
          event_type: ContentPublicationFanoutEventType;
          fanout_status: string;
          id: string;
          metadata: Json;
          previous_fanout_status: string | null;
          previous_target_status: string | null;
          source: string;
          target_status: string | null;
          user_id: string;
        };
        Insert: {
          action_key?: string | null;
          action_result: string;
          actor_id: string;
          content_publication_fanout_id: string;
          content_publication_fanout_target_id?: string | null;
          content_publication_id?: string | null;
          created_at?: string;
          event_type: ContentPublicationFanoutEventType;
          fanout_status: string;
          id?: string;
          metadata?: Json;
          previous_fanout_status?: string | null;
          previous_target_status?: string | null;
          source?: string;
          target_status?: string | null;
          user_id: string;
        };
        Update: {
          action_key?: string | null;
          action_result?: string;
          actor_id?: string;
          content_publication_fanout_id?: string;
          content_publication_fanout_target_id?: string | null;
          content_publication_id?: string | null;
          created_at?: string;
          event_type?: ContentPublicationFanoutEventType;
          fanout_status?: string;
          id?: string;
          metadata?: Json;
          previous_fanout_status?: string | null;
          previous_target_status?: string | null;
          source?: string;
          target_status?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_publication_fanout_events_fanout_user_fkey";
            columns: ["content_publication_fanout_id", "user_id"];
            referencedRelation: "content_publication_fanouts";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "content_publication_fanout_events_target_user_fkey";
            columns: ["content_publication_fanout_target_id", "user_id"];
            referencedRelation: "content_publication_fanout_targets";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "content_publication_fanout_events_publication_user_fkey";
            columns: ["content_publication_id", "user_id"];
            referencedRelation: "content_publications";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "content_publication_fanout_events_actor_id_fkey";
            columns: ["actor_id"];
            referencedRelation: "auth.users";
            referencedColumns: ["id"];
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
          p_capability_snapshot?: Json;
          p_capability_version?: string;
          p_content_job_id: string;
          p_scheduled_at_utc?: string | null;
          p_scheduled_timezone?: string | null;
          p_schedule_block_message?: string | null;
          p_schedule_block_reason?: ContentPublicationScheduleBlockReason | null;
          p_schedule_canceled_at?: string | null;
          p_schedule_canceled_reason?: string | null;
          p_schedule_capability_snapshot?: Json;
          p_schedule_created_at?: string | null;
          p_schedule_expired_at?: string | null;
          p_schedule_replaced_at?: string | null;
          p_schedule_source?: ContentPublicationScheduleSource | null;
          p_schedule_status?: ContentPublicationScheduleStatus;
          p_schedule_updated_at?: string | null;
          p_schedule_validation_metadata?: Json;
          p_platform_connection_id: string;
          p_provider_overrides?: Json;
          p_target_platform: Database["public"]["Enums"]["stream_platform"];
          p_requested_by: string;
          p_requested_at?: string;
          p_request_intent_hash: string;
          p_snapshot: Json;
          p_snapshot_hash: string;
          p_user_id: string;
          p_validation_code?: string;
          p_validation_message?: string | null;
          p_validation_metadata?: Json;
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
