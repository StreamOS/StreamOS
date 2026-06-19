export type SupabaseRestClient = {
  fetchImpl: typeof fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
};

export function createSupabaseRestClient({
  fetchImpl = fetch,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrl = process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL,
}: {
  fetchImpl?: typeof fetch;
  serviceRoleKey?: string;
  supabaseUrl?: string;
} = {}): SupabaseRestClient {
  const normalizedSupabaseUrl = supabaseUrl?.trim();
  const normalizedServiceRoleKey = serviceRoleKey?.trim();

  if (!normalizedSupabaseUrl || !normalizedServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return {
    fetchImpl,
    serviceRoleKey: normalizedServiceRoleKey,
    supabaseUrl: normalizedSupabaseUrl.replace(/\/+$/, ""),
  };
}

export function createSupabaseRestUrl({
  client,
  table,
}: {
  client: SupabaseRestClient;
  table: string;
}): URL {
  return new URL(`/rest/v1/${table}`, client.supabaseUrl);
}

export function getSupabaseRestHeaders(
  client: SupabaseRestClient,
): Record<string, string> {
  return {
    apikey: client.serviceRoleKey,
    Authorization: `Bearer ${client.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

export async function readSupabaseRows<TRow>({
  client,
  table,
  params,
}: {
  client: SupabaseRestClient;
  params: Record<string, string>;
  table: string;
}): Promise<TRow[]> {
  const url = createSupabaseRestUrl({ client, table });

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await client.fetchImpl(url, {
    headers: getSupabaseRestHeaders(client),
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase ${table} lookup failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as TRow[];
}

export async function patchSupabaseRows({
  client,
  params,
  payload,
  table,
}: {
  client: SupabaseRestClient;
  params: Record<string, string>;
  payload: Record<string, unknown>;
  table: string;
}): Promise<void> {
  const url = createSupabaseRestUrl({ client, table });

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await client.fetchImpl(url, {
    body: JSON.stringify(payload),
    headers: {
      ...getSupabaseRestHeaders(client),
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

export async function upsertSupabaseRow<TRow = unknown>({
  client,
  onConflict,
  payload,
  returnRepresentation = false,
  table,
}: {
  client: SupabaseRestClient;
  onConflict: string;
  payload: Record<string, unknown>;
  returnRepresentation?: boolean;
  table: string;
}): Promise<TRow | null> {
  const url = createSupabaseRestUrl({ client, table });
  url.searchParams.set("on_conflict", onConflict);

  if (returnRepresentation) {
    url.searchParams.set("select", "*");
  }

  const response = await client.fetchImpl(url, {
    body: JSON.stringify(payload),
    headers: {
      ...getSupabaseRestHeaders(client),
      Prefer: `resolution=merge-duplicates,return=${
        returnRepresentation ? "representation" : "minimal"
      }`,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase ${table} upsert failed with status ${response.status}.`,
    );
  }

  if (!returnRepresentation) {
    return null;
  }

  const rows = (await response.json()) as TRow[];

  return rows[0] ?? null;
}

export async function callSupabaseRpc<TRow = unknown>({
  args,
  client,
  functionName,
}: {
  args: Record<string, unknown>;
  client: SupabaseRestClient;
  functionName: string;
}): Promise<TRow> {
  const url = new URL(`/rest/v1/rpc/${functionName}`, client.supabaseUrl);
  const response = await client.fetchImpl(url, {
    body: JSON.stringify(args),
    headers: getSupabaseRestHeaders(client),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase RPC ${functionName} failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as TRow;
}
