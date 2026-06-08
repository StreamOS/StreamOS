# Auth Email Confirmation Test Plan

## Scope

Validates the Supabase Auth signup confirmation flow for StreamOS:

- Signup sends a confirmation email.
- Email link points to `/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
- `/auth/confirm` verifies the token hash with Supabase Auth.
- Success redirects to `/dashboard`.
- Failure redirects to `/auth/login?error=confirmation_failed`.

## Local Prerequisites

- Supabase CLI installed.
- Docker available for local Supabase services.
- `packages/database/supabase/config.toml` has `auth.email.enable_confirmations = true`.
- Web app `.env.local` points to the local Supabase API:

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from supabase status>
```

## Local Test Steps

1. Start local Supabase from the configured Supabase project directory:

```bash
supabase start
supabase status
```

2. Apply database migrations:

```bash
supabase db reset
```

3. Start the web app:

```bash
pnpm --filter @streamos/web dev
```

4. Open `http://localhost:3000/auth/signup`.

5. Register a new account with a unique email and password.

6. Open Inbucket at the local Supabase email UI shown by `supabase status`.
   The default local URL is usually `http://127.0.0.1:54324`.

7. Open the confirmation email. Confirm the link path has this shape:

```text
http://127.0.0.1:3000/auth/confirm?token_hash=<token>&type=email
```

8. Click the confirmation link.

9. Expected result:

- Browser lands on `/dashboard`.
- Supabase session cookies are present for the app origin.
- A creator workspace exists for the confirmed user.

## Failure Cases

1. Open `/auth/confirm` without query params.

Expected:

```text
/auth/login?error=confirmation_failed
```

2. Open `/auth/confirm?token_hash=invalid&type=email`.

Expected:

```text
/auth/login?error=confirmation_failed
```

3. Open `/auth/confirm?token_hash=<token>&type=recovery`.

Expected:

```text
/auth/login?error=confirmation_failed
```

## Hosted Supabase Template

In the Supabase Dashboard, set the Confirm signup email template link to:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Also allow the deployed app URL and local app URL in Auth Redirect URLs.
