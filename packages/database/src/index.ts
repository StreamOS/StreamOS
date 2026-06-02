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
