# Troubleshooting

## Local Next.js Build Artifact Recovery

Use this flow when the `apps/web` dev server fails with a stale or corrupt
Next.js artifact error such as:

- `Cannot find module './7751.js'`
- `__webpack_modules__[moduleId] is not a function`
- `webpack-runtime.js` stack traces that point into `.next/server`

### Recovery Steps

1. Stop any running `apps/web` dev server.
2. Reset the generated web build output:

```bash
pnpm clean:web
```

3. Restart the dashboard:

```bash
pnpm --filter @streamos/web dev
```

4. If the error returns immediately, run a clean production build to confirm
   that the source tree is healthy:

```bash
pnpm --filter @streamos/web build
```

### What `clean:web` Removes

- `apps/web/.next`
- `apps/web/tsconfig.tsbuildinfo`

### What `clean:web` Must Never Remove

- source files
- `.env` files or other local environment files
- lockfiles
- migrations
- uploaded assets
- audit, evidence, or release-proof artifacts

### When To Investigate Further

If the error persists after a clean rebuild, check the following:

- a second dev server process is still bound to port `3000`
- `apps/web/next.config.ts` contains an invalid custom Next.js setting
- `pnpm install --frozen-lockfile` is needed to repair a broken workspace install
- the error reproduces in both `dev` and `build`

If only `dev` is broken but `build` succeeds, the issue is usually a stale
local cache rather than a source-code regression.
