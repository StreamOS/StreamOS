export type Database = {
  public: {
    Tables: {
      creator_metrics: {
        Row: {
          id: string;
          platform: string;
          captured_at: string;
          viewer_count: number;
          revenue_cents: number;
        };
        Insert: {
          id?: string;
          platform: string;
          captured_at?: string;
          viewer_count: number;
          revenue_cents: number;
        };
        Update: {
          platform?: string;
          captured_at?: string;
          viewer_count?: number;
          revenue_cents?: number;
        };
      };
    };
  };
};
