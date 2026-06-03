export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ContentJobStatus = "pending" | "running" | "done" | "failed";
export type ContentJobType =
  | "transcription"
  | "clip_scoring"
  | "title_generation";
export type VodAssetStatus =
  | "ingested"
  | "transcribing"
  | "transcribed"
  | "failed";
export type StreamHighlightSource = "transcript" | "clip_scoring" | "manual";
export type ClipStatus =
  | "draft"
  | "queued"
  | "rendering"
  | "ready"
  | "failed"
  | "published";
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
  | "disputed"
  | "refunded"
  | "failed";

export type Database = {
  public: {
    Tables: {
      creators: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          handle: string | null;
          niche: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name: string;
          handle?: string | null;
          niche?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          display_name?: string;
          handle?: string | null;
          niche?: string | null;
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
          external_channel_id: string | null;
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
          platform_stream_id: string;
          started_at: string | null;
          ended_at: string | null;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel_id: string;
          platform_stream_id: string;
          started_at?: string | null;
          ended_at?: string | null;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          channel_id?: string;
          platform_stream_id?: string;
          started_at?: string | null;
          ended_at?: string | null;
          title?: string | null;
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
      metrics_snapshots: {
        Row: {
          id: string;
          user_id: string;
          creator_id: string;
          channel_id: string;
          platform: Database["public"]["Enums"]["stream_platform"];
          captured_at: string;
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
          queue_job_id: string | null;
          job_type: ContentJobType;
          status: ContentJobStatus;
          payload: Json;
          result: Json | null;
          error_message: string | null;
          retry_count: number;
          max_retries: number;
          last_retried_at: string | null;
          next_retry_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stream_id?: string | null;
          queue_job_id?: string | null;
          job_type: ContentJobType;
          status?: ContentJobStatus;
          payload?: Json;
          result?: Json | null;
          error_message?: string | null;
          retry_count?: number;
          max_retries?: number;
          last_retried_at?: string | null;
          next_retry_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          stream_id?: string | null;
          queue_job_id?: string | null;
          job_type?: ContentJobType;
          status?: ContentJobStatus;
          payload?: Json;
          result?: Json | null;
          error_message?: string | null;
          retry_count?: number;
          max_retries?: number;
          last_retried_at?: string | null;
          next_retry_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_jobs_stream_user_fkey";
            columns: ["stream_id", "user_id"];
            referencedRelation: "streams";
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
          external_asset_id: string | null;
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
          source_start_seconds: number | null;
          source_end_seconds: number | null;
          virality_score: number | null;
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
          source_start_seconds?: number | null;
          source_end_seconds?: number | null;
          virality_score?: number | null;
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
          source_start_seconds?: number | null;
          source_end_seconds?: number | null;
          virality_score?: number | null;
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
          status: ClipStatus;
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
          status?: ClipStatus;
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
          status?: ClipStatus;
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
          channel_id: string | null;
          stream_id: string | null;
          platform: Database["public"]["Enums"]["stream_platform"] | null;
          event_type: MonetizationEventType;
          status: MonetizationEventStatus;
          source: string;
          external_event_id: string | null;
          amount_cents: number;
          currency: string;
          quantity: number;
          payer_handle: string | null;
          sponsor_name: string | null;
          occurred_at: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          creator_id?: string | null;
          channel_id?: string | null;
          stream_id?: string | null;
          platform?: Database["public"]["Enums"]["stream_platform"] | null;
          event_type: MonetizationEventType;
          status?: MonetizationEventStatus;
          source: string;
          external_event_id?: string | null;
          amount_cents: number;
          currency?: string;
          quantity?: number;
          payer_handle?: string | null;
          sponsor_name?: string | null;
          occurred_at?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          creator_id?: string | null;
          channel_id?: string | null;
          stream_id?: string | null;
          platform?: Database["public"]["Enums"]["stream_platform"] | null;
          event_type?: MonetizationEventType;
          status?: MonetizationEventStatus;
          source?: string;
          external_event_id?: string | null;
          amount_cents?: number;
          currency?: string;
          quantity?: number;
          payer_handle?: string | null;
          sponsor_name?: string | null;
          occurred_at?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      connection_status: "connected" | "expired" | "revoked" | "pending";
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
