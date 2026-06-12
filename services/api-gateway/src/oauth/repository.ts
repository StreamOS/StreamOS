import type {
  OAuthConnectionResult,
  OAuthProvider,
  OAuthProviderProfile,
} from "@streamos/types";
import type { WebSubSubscription } from "@streamos/youtube-websub";

type JsonRecord = { [key: string]: unknown };

export type PersistOAuthConnectionInput = {
  accessTokenCiphertext: string;
  creatorId: string;
  expiresAt: string | null;
  profile: OAuthProviderProfile;
  provider: OAuthProvider;
  refreshTokenCiphertext: string | null;
  scopes: string[];
  userId: string;
};

export type OAuthConnectionRepository = {
  persistConnection(
    input: PersistOAuthConnectionInput,
  ): Promise<OAuthConnectionResult>;
  recordYouTubeWebSubSubscription?(
    input: RecordYouTubeWebSubSubscriptionInput,
  ): Promise<void>;
};

export type RecordYouTubeWebSubSubscriptionInput = {
  connectionId: string;
  subscription: WebSubSubscription;
  userId: string;
  youtubeChannelId: string;
};

type SupabaseRowId = {
  id: string;
};

export class SupabaseOAuthConnectionRepository implements OAuthConnectionRepository {
  constructor(
    private readonly config: {
      serviceRoleKey: string;
      supabaseUrl: string;
    },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async persistConnection(
    input: PersistOAuthConnectionInput,
  ): Promise<OAuthConnectionResult> {
    const now = new Date().toISOString();
    const channel = await this.upsert<SupabaseRowId>({
      onConflict: "creator_id,platform,external_channel_id",
      payload: {
        connected_at: now,
        creator_id: input.creatorId,
        display_name: input.profile.displayName,
        external_channel_id: input.profile.providerAccountId,
        follower_count: input.profile.followerCount,
        platform: input.provider,
        user_id: input.userId,
      },
      table: "channels",
    });

    const connection = await this.upsert<SupabaseRowId>({
      onConflict: "creator_id,platform,provider_account_id",
      payload: {
        access_token_ciphertext: input.accessTokenCiphertext,
        channel_id: channel.id,
        connected_at: now,
        creator_id: input.creatorId,
        expires_at: input.expiresAt,
        platform: input.provider,
        provider_account_id: input.profile.providerAccountId,
        provider_profile: {
          avatar_url: input.profile.avatarUrl,
          display_name: input.profile.displayName,
          follower_count: input.profile.followerCount,
          handle: input.profile.handle,
        },
        refresh_token_ciphertext: input.refreshTokenCiphertext,
        scopes: input.scopes,
        status: "connected",
        user_id: input.userId,
      },
      table: "platform_connections",
    });

    return {
      channelId: channel.id,
      connectionId: connection.id,
      expiresAt: input.expiresAt,
      profile: input.profile,
      scopes: input.scopes,
    };
  }

  async recordYouTubeWebSubSubscription({
    connectionId,
    subscription,
    userId,
    youtubeChannelId,
  }: RecordYouTubeWebSubSubscriptionInput): Promise<void> {
    const metadata = await this.getConnectionMetadata(connectionId);
    const nextMetadata = mergeWebSubSubscriptionMetadata({
      metadata,
      subscription,
    });

    await this.patch({
      filter: `id=eq.${connectionId}`,
      payload: {
        metadata: nextMetadata,
      },
      table: "platform_connections",
    });

    await this.upsert<SupabaseRowId>({
      onConflict: "channel_connection_id,topic_url",
      payload: {
        channel_connection_id: connectionId,
        expires_at: subscription.expiresAt,
        failed_renewals: subscription.status === "failed" ? 1 : 0,
        last_renewed_at: null,
        lease_seconds: subscription.leaseSeconds,
        status: subscription.status,
        subscribed_at: subscription.subscribedAt,
        topic_url: subscription.topicUrl,
        user_id: userId,
        youtube_channel_id: youtubeChannelId,
      },
      table: "youtube_websub_subscriptions",
    });
  }

  private async upsert<TRow>({
    onConflict,
    payload,
    table,
  }: {
    onConflict: string;
    payload: Record<string, unknown>;
    table: string;
  }): Promise<TRow> {
    const url = new URL(`/rest/v1/${table}`, this.config.supabaseUrl);
    url.searchParams.set("on_conflict", onConflict);
    url.searchParams.set("select", "id");

    const response = await this.fetchImpl(url, {
      body: JSON.stringify(payload),
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(
        `Supabase ${table} upsert failed with status ${response.status}.`,
      );
    }

    const rows = (await response.json()) as TRow[];
    const row = rows[0];

    if (!row) {
      throw new Error(`Supabase ${table} upsert returned no rows.`);
    }

    return row;
  }

  private async patch({
    filter,
    payload,
    table,
  }: {
    filter: string;
    payload: Record<string, unknown>;
    table: string;
  }): Promise<void> {
    const url = new URL(`/rest/v1/${table}`, this.config.supabaseUrl);
    const separatorIndex = filter.indexOf("=");
    const key = filter.slice(0, separatorIndex);
    const value = filter.slice(separatorIndex + 1);

    if (separatorIndex < 1 || !value) {
      throw new Error("Supabase patch filter is invalid.");
    }

    url.searchParams.set(key, value);

    const response = await this.fetchImpl(url, {
      body: JSON.stringify(payload),
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      method: "PATCH",
    });

    if (!response.ok) {
      throw new Error(
        `Supabase ${table} update failed with status ${response.status}.`,
      );
    }
  }

  private async getConnectionMetadata(
    connectionId: string,
  ): Promise<JsonRecord> {
    const url = new URL(
      "/rest/v1/platform_connections",
      this.config.supabaseUrl,
    );
    url.searchParams.set("id", `eq.${connectionId}`);
    url.searchParams.set("select", "metadata");
    url.searchParams.set("limit", "1");

    const response = await this.fetchImpl(url, {
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
      },
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `Supabase platform_connections metadata lookup failed with status ${response.status}.`,
      );
    }

    const rows = (await response.json()) as { metadata?: unknown }[];
    const metadata = rows[0]?.metadata;

    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return {};
    }

    return metadata as JsonRecord;
  }
}

function mergeWebSubSubscriptionMetadata({
  metadata,
  subscription,
}: {
  metadata: JsonRecord;
  subscription: WebSubSubscription;
}): JsonRecord {
  const websub = toJsonRecord(metadata.websub);
  const currentSubscriptions = Array.isArray(websub.subscriptions)
    ? websub.subscriptions.filter(
        (candidate): candidate is JsonRecord =>
          Boolean(candidate) &&
          typeof candidate === "object" &&
          !Array.isArray(candidate) &&
          candidate.topicUrl !== subscription.topicUrl,
      )
    : [];

  return {
    ...metadata,
    websub: {
      ...websub,
      failedRenewals:
        subscription.status === "failed"
          ? Number(websub.failedRenewals ?? 0) + 1
          : 0,
      lastRenewedAt: websub.lastRenewedAt ?? null,
      subscriptions: [
        ...currentSubscriptions,
        {
          expiresAt: subscription.expiresAt,
          leaseSeconds: subscription.leaseSeconds,
          status: subscription.status,
          subscribedAt: subscription.subscribedAt,
          topicUrl: subscription.topicUrl,
        },
      ],
    },
  };
}

function toJsonRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

export function createSupabaseOAuthConnectionRepository({
  fetchImpl = fetch,
}: {
  fetchImpl?: typeof fetch;
} = {}): OAuthConnectionRepository {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for OAuth persistence.",
    );
  }

  return new SupabaseOAuthConnectionRepository(
    { serviceRoleKey, supabaseUrl },
    fetchImpl,
  );
}
