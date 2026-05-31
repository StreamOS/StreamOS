export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      creators: {
        Row: {
          id: string;
          owner_id: string;
          display_name: string;
          handle: string | null;
          niche: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          display_name: string;
          handle?: string | null;
          niche?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
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
            foreignKeyName: "channels_creator_id_fkey";
            columns: ["creator_id"];
            referencedRelation: "creators";
            referencedColumns: ["id"];
          }
        ];
      };
      platform_connections: {
        Row: {
          id: string;
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
            foreignKeyName: "platform_connections_channel_id_fkey";
            columns: ["channel_id"];
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_connections_creator_id_fkey";
            columns: ["creator_id"];
            referencedRelation: "creators";
            referencedColumns: ["id"];
          }
        ];
      };
      metrics_snapshots: {
        Row: {
          id: string;
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
            foreignKeyName: "metrics_snapshots_channel_id_fkey";
            columns: ["channel_id"];
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "metrics_snapshots_creator_id_fkey";
            columns: ["creator_id"];
            referencedRelation: "creators";
            referencedColumns: ["id"];
          }
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

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Inserts<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type Updates<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
