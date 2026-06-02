# @streamos/database

Shared Supabase schema contracts for StreamOS.

## Migration Order

Apply migrations from:

```text
packages/database/supabase/migrations
```

Initial schema:

- `creators`
- `channels`
- `streams`
- `platform_connections`
- `metrics_snapshots`
- `content_jobs`

## Security Model

Every tenant-owned table has a required `user_id` column, row-level security enabled, and policies scoped to `user_id = auth.uid()`. Child tables keep their domain foreign keys, but composite tenant foreign keys prevent cross-user `creator_id` or `channel_id` links.

`content_jobs.queue_job_id` links BullMQ job attempts to durable database state.
Workers write it with the Supabase service role, while user-facing access remains
scoped through `user_id` RLS policies.

Provider OAuth tokens must be encrypted or vaulted before being written to `platform_connections.access_token_ciphertext` or `platform_connections.refresh_token_ciphertext`. Do not store plaintext provider tokens.

## Type Usage

Use the generated-style `Database` type with Supabase clients:

```ts
import type { Database } from "@streamos/database";
```
