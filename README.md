# StreamOS Monorepo

StreamOS is an AI-assisted operating layer for streamers. The platform combines discoverability, monetization insights, content automation, branding tools, multi-platform management, and analytics in one modular product surface.

## Workspace

This repository uses `pnpm` workspaces and Turborepo for parallel builds, task orchestration, and build caching.

```text
StreamOS/
├── apps/
│   └── web/                     # Next.js App Router dashboard
├── services/
│   ├── api-gateway/             # Backend-for-frontend aggregation service
│   └── automation-service/      # FastAPI service for clip and AI pipelines
├── workers/
│   └── transcription-worker/    # Async media transcription worker
├── packages/
│   ├── config/                  # Shared TypeScript configuration
│   ├── database/                # Supabase contracts and migration helpers
│   ├── types/                   # Shared domain contracts
│   └── ui/                      # Reusable React UI components
├── pnpm-workspace.yaml
└── turbo.json
```

The previous Vite/Electron prototype files are still present at the repository root for reference. New production work should target the monorepo packages above.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Copy environment variables:

```bash
cp .env.example .env.local
```

Start all development targets:

```bash
pnpm dev
```

Start only the dashboard:

```bash
pnpm --filter @streamos/web dev
```

The dashboard runs at `http://localhost:3000/dashboard`.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Next Implementation Steps

1. Configure Supabase Auth, row-level security policies, and generated database types in `packages/database`.
2. Add OAuth flows for Twitch, YouTube, TikTok, and Kick behind `services/api-gateway`.
3. Add a queue backend such as Redis/BullMQ or managed queues for transcription and clip-generation jobs.
4. Move durable AI workflows into `services/automation-service` and keep browser-visible API keys out of client components.
