import { z } from "zod";

export type ContentJobKind = "repurposing" | "transcription";
export type ContentJobStatus =
  | "cancelled"
  | "completed"
  | "failed"
  | "pending"
  | "processing";

export type ContentJobRecord = {
  id: string;
  max_retries: number;
  retry_count: number;
};

export type YouTubeConnection = {
  access_token_ciphertext: string;
  expires_at: string | null;
  id: string;
  refresh_token_ciphertext: string | null;
};

export type CreateContentJobInput = {
  jobType: ContentJobKind;
  payload: Record<string, unknown>;
  queueJobId: string;
  userId: string;
};

export type UpdateContentJobInput = {
  completedAt?: string | null;
  errorMessage?: string | null;
  id: string;
  result?: Record<string, unknown> | null;
  startedAt?: string | null;
  status: ContentJobStatus;
};

export type UpdateYouTubeConnectionInput = {
  accessTokenCiphertext: string;
  connectionId: string;
  expiresAt: string | null;
  refreshTokenCiphertext?: string;
};

export type ContentJobStore = {
  create(input: CreateContentJobInput): Promise<ContentJobRecord>;
  findYouTubeConnection(input: {
    channelId: string;
    userId: string;
  }): Promise<YouTubeConnection>;
  update(input: UpdateContentJobInput): Promise<void>;
  updateYouTubeConnection(input: UpdateYouTubeConnectionInput): Promise<void>;
};

const contentJobRecordSchema = z.object({
  id: z.string().uuid(),
  max_retries: z.number().int().min(0),
  retry_count: z.number().int().min(0),
});

const youtubeConnectionSchema = z.object({
  access_token_ciphertext: z.string().trim().min(1),
  expires_at: z.string().nullable(),
  id: z.string().uuid(),
  refresh_token_ciphertext: z.string().nullable(),
});

function getSupabaseHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function readRows<T>({
  response,
  schema,
}: {
  response: Response;
  schema: z.ZodType<T>;
}): Promise<T[]> {
  return z.array(schema).parse(await response.json());
}

async function assertOk(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    throw new Error(
      `${context} failed with ${response.status}: ${await response.text()}`,
    );
  }
}

export function createContentJobStore({
  fetchFn = fetch,
  serviceRoleKey,
  supabaseUrl,
}: {
  fetchFn?: typeof fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
}): ContentJobStore {
  const headers = getSupabaseHeaders(serviceRoleKey);

  return {
    async create(input: CreateContentJobInput): Promise<ContentJobRecord> {
      const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
      endpoint.searchParams.set("on_conflict", "queue_job_id");
      endpoint.searchParams.set("select", "id,retry_count,max_retries");

      const response = await fetchFn(endpoint, {
        body: JSON.stringify({
          job_type: input.jobType,
          max_retries: 3,
          payload: input.payload,
          queue_job_id: input.queueJobId,
          status: "pending",
          type: input.jobType,
          user_id: input.userId,
        }),
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        method: "POST",
      });

      await assertOk(response, "Supabase content_jobs upsert");
      const rows = await readRows({ response, schema: contentJobRecordSchema });
      const row = rows[0];

      if (!row) {
        throw new Error("Supabase content_jobs upsert returned no row.");
      }

      return row;
    },

    async findYouTubeConnection({
      channelId,
      userId,
    }): Promise<YouTubeConnection> {
      const endpoint = new URL("/rest/v1/platform_connections", supabaseUrl);
      endpoint.searchParams.set(
        "select",
        "id,access_token_ciphertext,refresh_token_ciphertext,expires_at",
      );
      endpoint.searchParams.set("user_id", `eq.${userId}`);
      endpoint.searchParams.set("platform", "eq.youtube");
      endpoint.searchParams.set("provider_account_id", `eq.${channelId}`);
      endpoint.searchParams.set("status", "eq.connected");
      endpoint.searchParams.set("limit", "1");

      const response = await fetchFn(endpoint, {
        headers,
        method: "GET",
      });

      await assertOk(response, "Supabase YouTube connection lookup");
      const rows = await readRows({
        response,
        schema: youtubeConnectionSchema,
      });
      const row = rows[0];

      if (!row) {
        throw new Error(
          `No connected YouTube account found for channel ${channelId}.`,
        );
      }

      return row;
    },

    async update(input: UpdateContentJobInput): Promise<void> {
      const endpoint = new URL("/rest/v1/content_jobs", supabaseUrl);
      endpoint.searchParams.set("id", `eq.${input.id}`);

      const response = await fetchFn(endpoint, {
        body: JSON.stringify({
          completed_at: input.completedAt,
          error_message: input.errorMessage,
          result: input.result,
          started_at: input.startedAt,
          status: input.status,
          updated_at: new Date().toISOString(),
        }),
        headers: {
          ...headers,
          Prefer: "return=minimal",
        },
        method: "PATCH",
      });

      await assertOk(response, "Supabase content_jobs update");
    },

    async updateYouTubeConnection(
      input: UpdateYouTubeConnectionInput,
    ): Promise<void> {
      const endpoint = new URL("/rest/v1/platform_connections", supabaseUrl);
      endpoint.searchParams.set("id", `eq.${input.connectionId}`);

      const patch: Record<string, unknown> = {
        access_token_ciphertext: input.accessTokenCiphertext,
        expires_at: input.expiresAt,
        updated_at: new Date().toISOString(),
      };

      if (input.refreshTokenCiphertext) {
        patch.refresh_token_ciphertext = input.refreshTokenCiphertext;
      }

      const response = await fetchFn(endpoint, {
        body: JSON.stringify(patch),
        headers: {
          ...headers,
          Prefer: "return=minimal",
        },
        method: "PATCH",
      });

      await assertOk(response, "Supabase YouTube connection update");
    },
  };
}
