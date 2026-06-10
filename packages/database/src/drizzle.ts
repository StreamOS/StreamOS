import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema.js";

export { schema };

export type DrizzleSchema = typeof schema;

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for Drizzle database access. Store it in local env or secret storage, never in browser-exposed NEXT_PUBLIC_* variables.",
    );
  }

  return databaseUrl;
}

export function createPostgresClient(connectionString = getDatabaseUrl()) {
  return postgres(connectionString, {
    prepare: false,
  });
}

export function createDrizzleClient(client = createPostgresClient()) {
  return drizzle(client, {
    schema,
  });
}

export type StreamOSDrizzleClient = ReturnType<typeof createDrizzleClient>;
