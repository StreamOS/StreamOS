import {
  assertEncryptionConfigured,
  decryptSecret,
  encryptSecret,
} from "../oauth/encryption.js";
import type { MetricsSyncProvider, MetricsSyncResult } from "@streamos/types";

import { GatewayError } from "../lib/gateway-error.js";
import {
  fetchProviderSnapshot,
  refreshProviderCredentials,
  shouldRefreshConnection,
} from "./providers.js";
import {
  loadPlatformConnection,
  updatePlatformConnectionCredentials,
  upsertMetricsSnapshot,
} from "./supabase.js";

const SYNCABLE_STATUSES = new Set(["connected", "degraded", "expired"]);

export async function syncNonTwitchMetrics({
  creatorId,
  fetchImpl = fetch,
  provider,
  userId,
}: {
  creatorId: string;
  fetchImpl?: typeof fetch;
  provider: MetricsSyncProvider;
  userId: string;
}): Promise<MetricsSyncResult> {
  assertEncryptionConfigured();

  const connection = await loadPlatformConnection({
    creatorId,
    fetchImpl,
    provider,
    userId,
  });

  if (!SYNCABLE_STATUSES.has(connection.status)) {
    throw new GatewayError({
      code: "PLATFORM_CONNECTION_NOT_FOUND",
      message: `The latest ${provider} connection is not syncable.`,
      provider,
      retryable: false,
      statusCode: 404,
    });
  }

  const accessToken = shouldRefreshConnection(connection)
    ? await refreshAndPersistConnection({
        connection,
        fetchImpl,
        provider,
      })
    : decryptAccessToken(connection.access_token_ciphertext, provider);

  const snapshot = await fetchProviderSnapshot({
    accessToken,
    connection,
    fetchImpl,
    provider,
    userId,
  });

  await upsertMetricsSnapshot({ fetchImpl, snapshot });

  return {
    provider,
    snapshot,
    syncedAt: snapshot.snapshotAt,
  };
}

async function refreshAndPersistConnection({
  connection,
  fetchImpl,
  provider,
}: {
  connection: Awaited<ReturnType<typeof loadPlatformConnection>>;
  fetchImpl: typeof fetch;
  provider: MetricsSyncProvider;
}): Promise<string> {
  const refreshed = await refreshProviderCredentials({
    connection,
    fetchImpl,
    provider,
  });

  await updatePlatformConnectionCredentials({
    connectionId: connection.id,
    fetchImpl,
    payload: {
      accessTokenCiphertext: encryptSecret(refreshed.accessToken),
      expiresAt: refreshed.expiresAt,
      refreshTokenCiphertext: refreshed.refreshToken
        ? encryptSecret(refreshed.refreshToken)
        : connection.refresh_token_ciphertext,
      scopes: refreshed.scopes ?? connection.scopes,
    },
  });

  return refreshed.accessToken;
}

function decryptAccessToken(
  encryptedAccessToken: string | null,
  provider: MetricsSyncProvider,
): string {
  if (!encryptedAccessToken) {
    throw new GatewayError({
      code: "TOKEN_DECRYPT_FAILED",
      message: "The platform connection has no encrypted access token.",
      provider,
      retryable: false,
      statusCode: 500,
    });
  }

  try {
    return decryptSecret(encryptedAccessToken);
  } catch (error) {
    throw new GatewayError({
      code: "TOKEN_DECRYPT_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "Could not decrypt platform access token.",
      provider,
      retryable: false,
      statusCode: 500,
    });
  }
}
