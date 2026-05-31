# StreamOS Monorepo

StreamOS is an AI-assisted operating layer for streamers. The platform combines discoverability, monetization insights, content automation, branding tools, multi-platform management, and analytics in one modular product surface.

## Workspace

This repository uses `pnpm` workspaces and Turborepo for parallel builds, task orchestration, and build caching.

```text
StreamOS/
|-- apps/
|   `-- web/                     # Next.js App Router dashboard
|-- services/
|   |-- api-gateway/             # Backend-for-frontend aggregation service
|   `-- automation-service/      # FastAPI service for clip and AI pipelines
|-- workers/
|   `-- transcription-worker/    # Async media transcription worker
|-- packages/
|   |-- config/                  # Shared TypeScript configuration
|   |-- database/                # Supabase contracts and migration helpers
|   |-- types/                   # Shared domain contracts
|   `-- ui/                      # Reusable React UI components
|-- pnpm-workspace.yaml
`-- turbo.json
```

The production frontend lives in `apps/web`. The previous root Vite/Electron prototype has been removed so new frontend work has one clear target.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Create local environment values:

```bash
cp .env.example apps/web/.env.local
```

Start only the dashboard:

```bash
pnpm --filter @streamos/web dev
```

The dashboard runs at `http://localhost:3000/dashboard`.

Generate a local encryption key before storing platform OAuth tokens:

```bash
node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"
```

Set the generated value as `APP_ENCRYPTION_KEY` in `apps/web/.env.local`.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Supabase Auth

The dashboard uses Supabase SSR auth. The initial schema migration must be applied before using login/signup.

For hosted Supabase email confirmations, set the Confirm signup email template link to:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Also allow your local and deployed app URLs in Supabase Auth URL configuration.

## Twitch OAuth

The first platform connector lives in the web app route handlers:

- `/api/platforms/twitch/connect`
- `/api/platforms/twitch/callback`

Configure these server-only values in `apps/web/.env.local`:

```bash
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=http://localhost:3000/api/platforms/twitch/callback
TWITCH_SCOPES=user:read:email
APP_ENCRYPTION_KEY=base64:replace-with-32-byte-key
```

Register the same redirect URI in the Twitch Developer Console. If Next.js falls back to another local port, update both `TWITCH_REDIRECT_URI` and the Twitch app settings to match.

## Next Implementation Steps

1. Add OAuth flows for Twitch, YouTube, TikTok, and Kick behind `services/api-gateway`.
2. Add a queue backend such as Redis/BullMQ or managed queues for transcription and clip-generation jobs.
3. Move durable AI workflows into `services/automation-service` and keep browser-visible API keys out of client components.
