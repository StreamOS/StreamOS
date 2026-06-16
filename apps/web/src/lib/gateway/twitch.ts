export type TwitchGatewayMutationInput = {
  creatorId: string;
  userId: string;
};

type GatewayConfig = {
  apiGatewaySecret: string;
  gatewayUrl: string;
};

type TwitchGatewayErrorBody = {
  error?: string;
  message?: string;
};

function getGatewayConfig(): GatewayConfig {
  const gatewayUrl = process.env.API_GATEWAY_URL?.trim();
  const apiGatewaySecret = process.env.API_GATEWAY_SECRET?.trim();

  if (!gatewayUrl || !apiGatewaySecret) {
    throw new Error("API_GATEWAY_URL and API_GATEWAY_SECRET are required.");
  }

  return {
    apiGatewaySecret,
    gatewayUrl: gatewayUrl.replace(/\/+$/u, ""),
  };
}

export function createTwitchGatewayConnectUrl(): URL {
  const { gatewayUrl } = getGatewayConfig();

  return new URL("/api/auth/twitch/connect", gatewayUrl);
}

export async function refreshTwitchConnectionViaGateway(
  input: TwitchGatewayMutationInput,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await postTwitchGatewayMutation("/api/auth/twitch/refresh", input, fetchImpl);
}

export async function disconnectTwitchConnectionViaGateway(
  input: TwitchGatewayMutationInput,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await postTwitchGatewayMutation(
    "/api/auth/twitch/disconnect",
    input,
    fetchImpl,
  );
}

async function postTwitchGatewayMutation(
  path: string,
  input: TwitchGatewayMutationInput,
  fetchImpl: typeof fetch,
): Promise<void> {
  const { apiGatewaySecret, gatewayUrl } = getGatewayConfig();
  const response = await fetchImpl(new URL(path, gatewayUrl), {
    body: JSON.stringify({
      creator_id: input.creatorId,
      user_id: input.userId,
    }),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiGatewaySecret}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (response.ok) {
    return;
  }

  const payload = (await response
    .json()
    .catch(() => null)) as TwitchGatewayErrorBody | null;
  const message =
    payload?.message ??
    payload?.error ??
    `Twitch gateway request failed with status ${response.status}.`;

  throw new Error(message);
}
