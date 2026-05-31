# StreamOS Architecture

## Architecture Goal

StreamOS should be built as a modular creator operations platform. The frontend owns the dashboard experience, while backend services isolate platform integrations, AI processing, analytics ingestion, and secure credential handling.

## Target Application Shape

```text
src/
├── app/
│   ├── dashboard/
│   ├── api/
│   └── layout.tsx
├── components/
│   ├── ui/
│   ├── layout/
│   └── modules/
├── lib/
│   ├── supabase/
│   ├── integrations/
│   └── utils/
├── store/
└── types/
```

## Module Boundaries

- Dashboard routes compose modules and handle product-level navigation.
- UI components stay presentational and reusable.
- Feature modules own streamer workflows such as analytics, clips, monetization, SEO, and branding.
- Integration clients live under `src/lib/integrations` and never expose provider secrets to browser code.
- Database and API contracts live under `src/types` and should be generated or validated where possible.

## Backend Responsibilities

- OAuth and token refresh for Twitch, YouTube, TikTok, and Kick.
- Webhook validation and event ingestion.
- Analytics normalization into Supabase PostgreSQL.
- AI jobs for transcription, clip scoring, title generation, and repurposing.
- Rate limiting, retry handling, and audit logging for external API calls.

## Data Model Direction

Core entities should include:

- `creators`
- `channels`
- `platform_connections`
- `streams`
- `metrics_snapshots`
- `clips`
- `content_jobs`
- `brand_assets`
- `monetization_events`

Use row-level security in Supabase for tenant isolation. Service-role keys must remain server-only.

## API Strategy

Use REST route handlers for simple commands and webhooks:

- `/api/platforms/connect`
- `/api/platforms/callback`
- `/api/metrics/sync`
- `/api/clips/analyze`
- `/api/webhooks/twitch`
- `/api/webhooks/youtube`

Use realtime channels or server-sent events for live viewer counts, stream status, ingestion progress, and notifications.

## Security Baseline

- Store provider secrets only in server-side environment variables.
- Validate all webhook signatures before processing events.
- Encrypt or vault refresh tokens.
- Apply Supabase row-level security to all tenant-owned tables.
- Add integration tests for API endpoints before production rollout.

## Validation

Expected checks for future TypeScript work:

```bash
npm run lint
npm run typecheck
npm test
```

The current prototype only exposes:

```bash
npm start
```

