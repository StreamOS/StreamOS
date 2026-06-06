# AGENTS.md

## Project Overview

StreamOS is a modular AI-powered creator operations platform (monorepo).
Target users: streamers on Twitch, YouTube, TikTok, Kick.

## Monorepo Structure

- `apps/web/` - Next.js App Router dashboard (primary frontend target)
- `services/api-gateway/` - BFF aggregation, BullMQ queue, OAuth
- `services/automation-service/` - FastAPI, AI jobs (clips, transcription)
- `workers/transcription-worker/` - Async BullMQ worker
- `packages/types/` - shared domain types (ALWAYS update here, never duplicate)
- `packages/database/` - Supabase migrations and contracts

## Tech Stack

- Frontend: Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS v4
- Backend: FastAPI (Python 3.12) + Node.js API Gateway
- Queue: BullMQ + Redis (Upstash in production)
- Database: Supabase (PostgreSQL) + Row-Level Security
- AI: OpenAI gpt-4o (complex tasks), gpt-4o-mini (title gen), Whisper (transcription)
- Deployment: Vercel (web), Railway (services/workers)

## Module Boundaries - STRICT

- Frontend components MUST NOT call OpenAI or Supabase service-role directly
- AI jobs (clip scoring, transcription) live ONLY in `services/automation-service/`
- OAuth/token flows live ONLY in `services/api-gateway/` or Next.js Server Actions
- DB migrations live ONLY in `packages/database/supabase/migrations/`
- All new Supabase tables MUST have `user_id` + RLS policy `user_id = auth.uid()`

## Security Hard Rules (NEVER violate)

- NEVER set `NEXT_PUBLIC_OPENAI_KEY` or `NEXT_PUBLIC_OPENAI_API_KEY`
- NEVER expose `SUPABASE_SERVICE_ROLE_KEY` in browser code or `NEXT_PUBLIC_*`
- NEVER store platform OAuth tokens unencrypted - use `APP_ENCRYPTION_KEY`
- ALWAYS validate webhook signatures before processing events
- ALWAYS keep provider secrets server-side only

## Code Style

- TypeScript strict mode on all packages
- Airbnb ESLint config
- Component files: PascalCase (`AnalyticsDashboard.tsx`)
- Hooks: camelCase with `use` prefix (`useMetricsSync.ts`)
- API route handlers: kebab-case folders (`/api/platforms/twitch/`)
- Python: PEP8, type hints required on all FastAPI routes

## Commands Codex may run

```bash
pnpm install
pnpm --filter @streamos/web dev
pnpm validate          # TS + tests + pytest - run before every PR
pnpm e2e:jobs
pnpm e2e:transcription
python -m pytest services/automation-service
```

## Commands Codex must NOT run

- `pnpm infra:up` / `pnpm infra:down` - requires Docker
- Any command that writes to `.env` files
- Any command that commits directly to `main`

## Testing Requirements

- Run `pnpm validate` before finalizing any PR
- All new API endpoints need at least one integration test
- FastAPI routes: pytest with at least one success + one error case
- Supabase queries: test with RLS enabled, never with service-role in tests

## PR Instructions

- Branch: `feature/`, `fix/`, or `refactor/` prefix
- Title format: `[Feature/Fix/Refactor] Short description`
- PR body must include: **What changed**, **Why**, **Testing Done**
- Never commit secrets, migration rollbacks, or direct `main` pushes

## Git & Commit Rules

- Use Conventional Commits: `<type>(<scope>): <description>`
- Scopes: web | api | automation | ui | worker | config | ci
- Never commit: .env\*, node_modules/, .venv/, dist/, .next/
- One commit per workspace scope when changes are cross-cutting
- Run `pnpm typecheck` before any commit

## Next Implementation Priorities

1. OAuth flows for YouTube, TikTok, Kick (behind `services/api-gateway`)
2. DB migrations: `streams`, `clips`, `content_jobs`, `brand_assets`, `monetization_events`
3. BullMQ workers: transcription + clip generation
4. Move AI workflows fully into `services/automation-service`
5. Branding module: `apps/web/src/modules/branding`
6. Monetization dashboard: `apps/web/src/modules/monetization`
