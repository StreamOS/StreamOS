import express from "express";
import type { Router } from "express";
import { z } from "zod";
import type { OAuthProvider } from "@streamos/types";

import {
  createSupabaseRestClient,
  patchSupabaseRows,
  readSupabaseRows,
  type SupabaseRestClient,
} from "../lib/supabaseRest.js";

const disconnectPayloadSchema = z.object({
  user_id: z.string().uuid(),
});

const providerSchema = z.enum(["twitch", "youtube", "tiktok", "kick"]);

type ConnectionRow = {
  id: string;
  metadata: unknown;
  platform: OAuthProvider;
  user_id: string;
};

export function createPlatformConnectionsRouter({
  fetchImpl = fetch,
}: {
  fetchImpl?: typeof fetch;
} = {}): Router {
  const router = express.Router();

  router.post("/:provider/disconnect", async (request, response) => {
    const parsedProvider = providerSchema.safeParse(request.params.provider);

    if (!parsedProvider.success) {
      response.status(404).json({
        error: "provider_not_supported",
        message: "Provider is not supported by this gateway.",
      });
      return;
    }

    const parsedPayload = disconnectPayloadSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: "invalid_disconnect_payload",
        issues: parsedPayload.error.issues,
      });
      return;
    }

    let supabase: SupabaseRestClient;

    try {
      supabase = createSupabaseRestClient({ fetchImpl });
    } catch (error) {
      response.status(503).json({
        error: "supabase_not_configured",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const result = await disconnectProvider({
        provider: parsedProvider.data,
        supabase,
        userId: parsedPayload.data.user_id,
      });

      if (!result) {
        response.status(404).json({
          error: "connection_not_found",
          message: "No active provider connection was found.",
        });
        return;
      }

      response.status(200).json({
        data: {
          platform: parsedProvider.data,
          status: "disconnected",
        },
        success: true,
      });
    } catch (error) {
      response.status(502).json({
        error: "provider_disconnect_failed",
        message:
          error instanceof Error
            ? error.message
            : "Provider connection could not be disconnected.",
      });
    }
  });

  return router;
}

async function disconnectProvider({
  provider,
  supabase,
  userId,
}: {
  provider: OAuthProvider;
  supabase: SupabaseRestClient;
  userId: string;
}): Promise<boolean> {
  const rows = await readSupabaseRows<ConnectionRow>({
    client: supabase,
    params: {
      limit: "1",
      order: "connected_at.desc",
      platform: `eq.${provider}`,
      select: "id,user_id,platform,metadata",
      status: "in.(connected,expired,degraded,pending)",
      user_id: `eq.${userId}`,
    },
    table: "platform_connections",
  });
  const connection = rows[0];

  if (!connection) {
    return false;
  }

  await patchSupabaseRows({
    client: supabase,
    params: {
      id: `eq.${connection.id}`,
      user_id: `eq.${userId}`,
    },
    payload: {
      metadata: patchDisconnectMetadata(provider, connection.metadata),
      status: "disconnected",
      updated_at: new Date().toISOString(),
    },
    table: "platform_connections",
  });

  if (provider === "youtube") {
    await patchSupabaseRows({
      client: supabase,
      params: {
        channel_connection_id: `eq.${connection.id}`,
        user_id: `eq.${userId}`,
      },
      payload: {
        status: "unsubscribed",
      },
      table: "youtube_websub_subscriptions",
    }).catch((error) => {
      console.error("YouTube WebSub tracking disconnect update failed.", {
        connectionId: connection.id,
        error,
        userId,
      });
    });
  }

  return true;
}

function patchDisconnectMetadata(
  provider: OAuthProvider,
  metadata: unknown,
): Record<string, unknown> {
  const currentMetadata = isRecord(metadata) ? metadata : {};

  if (provider === "twitch") {
    return {
      ...currentMetadata,
      eventsub: null,
    };
  }

  if (provider === "youtube") {
    const websub = isRecord(currentMetadata.websub)
      ? currentMetadata.websub
      : {};

    return {
      ...currentMetadata,
      websub: {
        ...websub,
        subscriptions: markWebSubSubscriptionsUnsubscribed(
          websub.subscriptions,
        ),
      },
    };
  }

  return currentMetadata;
}

function markWebSubSubscriptionsUnsubscribed(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((subscription) =>
    isRecord(subscription)
      ? {
          ...subscription,
          status: "unsubscribed",
        }
      : subscription,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
