import type {
  OAuthConnectionResult,
  OAuthProvider,
  OAuthProviderProfile,
} from "@streamos/types";

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
}

export function createSupabaseOAuthConnectionRepository({
  fetchImpl = fetch,
}: {
  fetchImpl?: typeof fetch;
} = {}): OAuthConnectionRepository {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
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
