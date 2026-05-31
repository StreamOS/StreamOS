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
- `platform_connections`
- `metrics_snapshots`

## Security Model

All tenant-owned tables have row-level security enabled. Rows are scoped through `creators.owner_id = auth.uid()`.

Provider OAuth tokens must be encrypted or vaulted before being written to `platform_connections.access_token_ciphertext` or `platform_connections.refresh_token_ciphertext`. Do not store plaintext provider tokens.

## Type Usage

Use the generated-style `Database` type with Supabase clients:

```ts
import type { Database } from "@streamos/database";
```
