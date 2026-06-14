> streamos-monorepo@0.1.0 railway:audit C:\Dev\StreamOS
> node scripts/audit-railway-env.cjs "--env" "staging" "--format" "markdown" "--railway-bin" "C:\\Users\\dorts\\AppData\\Roaming\\npm\\railway.cmd"

# StreamOS Railway Env Audit

Generated: 2026-06-14T09:47:22.784Z
Project: terrific-reflection (edb7c5f7-6ee6-475e-9095-eb689f5284e8)

## staging

### api-gateway

| Variable                         | Scope   | Status | Checks                                                    | Summary                                   |
| -------------------------------- | ------- | ------ | --------------------------------------------------------- | ----------------------------------------- |
| API_GATEWAY_ALLOWED_ORIGINS      | service | ✅     | required; https://stream-os-web.vercel.app                | Value is configured via service.          |
| API_GATEWAY_RATE_LIMIT_ENABLED   | missing | ✅     | optional                                                  | Optional variable is unset.               |
| API_GATEWAY_RATE_LIMIT_MAX       | service | ✅     | required; present                                         | Value is configured via service.          |
| API_GATEWAY_RATE_LIMIT_WINDOW_MS | service | ✅     | required; present                                         | Value is configured via service.          |
| API_GATEWAY_SECRET               | service | ✅     | required; present                                         | Value is configured via service.          |
| APP_ENCRYPTION_KEY               | service | ✅     | required; present                                         | Value is configured via service.          |
| CLIP_GENERATION_QUEUE_NAME       | service | ✅     | required; present                                         | Value is configured via service.          |
| CLIP_WORKER_CONCURRENCY          | service | ✅     | required; present                                         | Value is configured via service.          |
| CONNECT_SUCCESS_REDIRECT         | service | ✅     | required; https://stream-os-web.vercel.app                | Value is configured via service.          |
| HOST                             | service | ✅     | required; present                                         | Value is configured via service.          |
| KICK_CLIENT_ID                   | service | ✅     | required; present                                         | Value is configured via service.          |
| KICK_CLIENT_SECRET               | service | ✅     | required; present                                         | Value is configured via service.          |
| KICK_REDIRECT_URI                | service | ✅     | required; https://api-gateway-staging-0598.up.railway.app | Value is configured via service.          |
| KICK_SCOPES                      | service | ✅     | required; present                                         | Value is configured via service.          |
| KICK_WEBHOOK_SECRET              | service | ✅     | required; present                                         | Value is configured via service.          |
| NODE_ENV                         | service | ✅     | required; production                                      | Value is configured via service.          |
| PORT                             | service | ✅     | required; present                                         | Value is configured via service.          |
| PUBLIC_NETWORKING                | service | ✅     | networking                                                | Public networking is enabled as expected. |
| QUEUE_DEFAULT_NAME               | service | ✅     | required; present                                         | Value is configured via service.          |
| RAILWAY_HEALTHCHECK_TIMEOUT_SEC  | service | ✅     | required; present                                         | Value is configured via service.          |
| REDIS_URL                        | service | ✅     | required; rediss://accurate-louse-113218.upstash.io:6379  | Value is configured via service.          |
| STREAM_EVENT_WEBHOOK_SECRET      | service | ✅     | required; present                                         | Value is configured via service.          |
| STREAMOS_PUBLIC_URL              | service | ✅     | optional; https://api-gateway-staging-0598.up.railway.app | Value is configured via service.          |
| SUPABASE_SERVICE_ROLE_KEY        | service | ✅     | required; present                                         | Value is configured via service.          |
| SUPABASE_URL                     | service | ✅     | required; https://bfnnjjjxfgabwqdozlvw.supabase.co        | Value is configured via service.          |
| TIKTOK_CLIENT_KEY                | service | ✅     | required; present                                         | Value is configured via service.          |
| TIKTOK_CLIENT_SECRET             | service | ✅     | required; present                                         | Value is configured via service.          |
| TIKTOK_REDIRECT_URI              | service | ✅     | required; https://api-gateway-staging-0598.up.railway.app | Value is configured via service.          |
| TIKTOK_SCOPES                    | service | ✅     | required; present                                         | Value is configured via service.          |
| TRANSCRIPTION_QUEUE_NAME         | service | ✅     | required; present                                         | Value is configured via service.          |
| YOUTUBE_CLIENT_ID                | service | ✅     | required; present                                         | Value is configured via service.          |
| YOUTUBE_CLIENT_SECRET            | service | ✅     | required; present                                         | Value is configured via service.          |
| YOUTUBE_CONNECT_SUCCESS_REDIRECT | missing | ✅     | optional                                                  | Optional variable is unset.               |
| YOUTUBE_REDIRECT_URI             | service | ✅     | required; https://api-gateway-staging-0598.up.railway.app | Value is configured via service.          |
| YOUTUBE_SCOPES                   | service | ✅     | required; present                                         | Value is configured via service.          |
| YOUTUBE_WEBHOOK_SECRET           | service | ✅     | optional; present                                         | Value is configured via service.          |
| YOUTUBE_WEBSUB_SECRET            | service | ✅     | optional; present                                         | Value is configured via service.          |
| YOUTUBE_WEBSUB_VERIFY_TOKEN      | missing | ✅     | optional                                                  | Optional variable is unset.               |

Info extras:

- ADMIN_SECRET (service): present
- TWITCH_EVENTSUB_SECRET (service): present

| Health Check              | Method           | Target                                                 | Status           | Summary                                                                                                                            |
| ------------------------- | ---------------- | ------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| api-gateway-public-health | public-fetch     | https://api-gateway-staging-0598.up.railway.app/health | 200 / payload ok | OK                                                                                                                                 |
| api-gateway-local-health  | railway-ssh-node | http://127.0.0.1:4000/health                           | unverified       | C:\\Users\\dorts\\AppData\\Roaming\\npm\\railway.cmd ssh -p edb7c5f7-6ee6-475e-9095-eb689f5284e8 -e staging -s api-gateway node -e |

let target = process.argv[1];
(async () => {
try {
if (!target) {
if (!process.env.AUTOMATION_SERVICE_URL) {
throw new Error("AUTOMATION_SERVICE_URL is not set in the remote service environment.");
}

      target = new URL("/health", process.env.AUTOMATION_SERVICE_URL).toString();
    }

    const response = await fetch(target);
    const body = await response.text();
    process.stdout.write(JSON.stringify({
      body,
      ok: response.ok,
      status: response.status,
      target,
    }));

} catch (error) {
process.stdout.write(JSON.stringify({
error: error instanceof Error ? error.message : String(error),
ok: false,
target,
}));
}
})();
http://127.0.0.1:4000/health failed with exit code 1: Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource you're trying to use. |

### automation-service

| Variable                             | Scope   | Status | Checks                           | Summary                              |
| ------------------------------------ | ------- | ------ | -------------------------------- | ------------------------------------ |
| HOST                                 | service | ✅     | required; present                | Value is configured via service.     |
| OPENAI_API_KEY                       | service | ✅     | required; present                | Value is configured via service.     |
| OPENAI_BASE_URL                      | service | ✅     | required; https://api.openai.com | Value is configured via service.     |
| OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES | service | ✅     | required; present                | Value is configured via service.     |
| OPENAI_MODEL                         | service | ✅     | required; present                | Value is configured via service.     |
| OPENAI_TIMEOUT_SECONDS               | service | ✅     | required; present                | Value is configured via service.     |
| OPENAI_TITLE_MODEL                   | service | ✅     | required; present                | Value is configured via service.     |
| OPENAI_TRANSCRIPTION_MODEL           | service | ✅     | required; present                | Value is configured via service.     |
| PORT                                 | service | ✅     | required; present                | Value is configured via service.     |
| PUBLIC_NETWORKING                    | service | ✅     | networking                       | Service remains private as expected. |
| RAILWAY_HEALTHCHECK_TIMEOUT_SEC      | service | ✅     | required; present                | Value is configured via service.     |
| REPLICATE_API_TOKEN                  | service | ✅     | required; present                | Value is configured via service.     |
| STREAMOS_E2E_MODE                    | service | ✅     | required; present                | Value is configured via service.     |
| TRANSCRIPTION_PROCESSOR_MODE         | service | ✅     | required; openai                 | Value is configured via service.     |

| Health Check                    | Method             | Target                       | Status     | Summary                                                                                                                                     |
| ------------------------------- | ------------------ | ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| automation-service-local-health | railway-ssh-python | http://127.0.0.1:8000/health | unverified | C:\\Users\\dorts\\AppData\\Roaming\\npm\\railway.cmd ssh -p edb7c5f7-6ee6-475e-9095-eb689f5284e8 -e staging -s automation-service python -c |

import json
import sys
from urllib import request, error

target = sys.argv[1]
try:
with request.urlopen(target, timeout=5) as response:
body = response.read().decode("utf-8")
print(json.dumps({
"body": body,
"ok": 200 <= response.status < 300,
"status": response.status,
"target": target,
}))
except error.HTTPError as exc:
print(json.dumps({
"body": exc.read().decode("utf-8"),
"ok": False,
"status": exc.code,
"target": target,
}))
except Exception as exc:
print(json.dumps({
"error": str(exc),
"ok": False,
"target": target,
}))
http://127.0.0.1:8000/health failed with exit code 1: Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource you're trying to use. |

### clip-worker

| Variable                   | Scope   | Status | Checks                                                    | Summary                              |
| -------------------------- | ------- | ------ | --------------------------------------------------------- | ------------------------------------ |
| AUTOMATION_SERVICE_URL     | service | ✅     | required; http://automation-service.railway.internal:8000 | Value is configured via service.     |
| CLIP_GENERATION_QUEUE_NAME | missing | ✅     | optional                                                  | Optional variable is unset.          |
| CLIP_WORKER_CONCURRENCY    | missing | ✅     | optional                                                  | Optional variable is unset.          |
| PUBLIC_NETWORKING          | service | ✅     | networking                                                | Service remains private as expected. |
| QUEUE_DEFAULT_NAME         | missing | ✅     | optional                                                  | Optional variable is unset.          |
| REDIS_URL                  | service | ✅     | required; rediss://accurate-louse-113218.upstash.io:6379  | Value is configured via service.     |
| SUPABASE_SERVICE_ROLE_KEY  | service | ✅     | required; present                                         | Value is configured via service.     |
| SUPABASE_URL               | service | ✅     | required; https://bfnnjjjxfgabwqdozlvw.supabase.co        | Value is configured via service.     |

### content-job-retry-worker

| Variable                                  | Scope   | Status | Checks                                                   | Summary                              |
| ----------------------------------------- | ------- | ------ | -------------------------------------------------------- | ------------------------------------ |
| CLIP_GENERATION_QUEUE_NAME                | service | ✅     | required; present                                        | Value is configured via service.     |
| CLIP_WORKER_CONCURRENCY                   | service | ✅     | required; present                                        | Value is configured via service.     |
| CONTENT_JOB_RETRY_ATTEMPTS                | service | ✅     | required; present                                        | Value is configured via service.     |
| CONTENT_JOB_RETRY_BACKOFF_MS              | service | ✅     | required; present                                        | Value is configured via service.     |
| CONTENT_JOB_RETRY_WORKER_BATCH_SIZE       | service | ✅     | required; present                                        | Value is configured via service.     |
| CONTENT_JOB_RETRY_WORKER_POLL_INTERVAL_MS | service | ✅     | required; present                                        | Value is configured via service.     |
| PUBLIC_NETWORKING                         | service | ✅     | networking                                               | Service remains private as expected. |
| QUEUE_DEFAULT_NAME                        | missing | ✅     | optional                                                 | Optional variable is unset.          |
| REDIS_URL                                 | service | ✅     | required; rediss://accurate-louse-113218.upstash.io:6379 | Value is configured via service.     |
| SUPABASE_SERVICE_ROLE_KEY                 | service | ✅     | required; present                                        | Value is configured via service.     |
| SUPABASE_URL                              | service | ✅     | required; https://bfnnjjjxfgabwqdozlvw.supabase.co       | Value is configured via service.     |
| TRANSCRIPTION_QUEUE_NAME                  | service | ✅     | required; present                                        | Value is configured via service.     |

### transcription-worker

| Variable                         | Scope   | Status | Checks                                                    | Summary                              |
| -------------------------------- | ------- | ------ | --------------------------------------------------------- | ------------------------------------ |
| AUTOMATION_SERVICE_URL           | service | ✅     | required; http://automation-service.railway.internal:8000 | Value is configured via service.     |
| CLIP_GENERATION_QUEUE_NAME       | missing | ✅     | optional                                                  | Optional variable is unset.          |
| CLIP_WORKER_CONCURRENCY          | service | ✅     | required; present                                         | Value is configured via service.     |
| PUBLIC_NETWORKING                | service | ✅     | networking                                                | Service remains private as expected. |
| QUEUE_DEFAULT_NAME               | missing | ✅     | optional                                                  | Optional variable is unset.          |
| REDIS_URL                        | service | ✅     | required; rediss://accurate-louse-113218.upstash.io:6379  | Value is configured via service.     |
| STREAM_JOB_QUEUE_NAME            | missing | ✅     | optional                                                  | Optional variable is unset.          |
| SUPABASE_SERVICE_ROLE_KEY        | service | ✅     | required; present                                         | Value is configured via service.     |
| SUPABASE_URL                     | service | ✅     | required; https://bfnnjjjxfgabwqdozlvw.supabase.co        | Value is configured via service.     |
| TRANSCRIPTION_QUEUE_NAME         | service | ✅     | required; present                                         | Value is configured via service.     |
| TRANSCRIPTION_WORKER_CONCURRENCY | service | ✅     | required; present                                         | Value is configured via service.     |
| TWITCH_CLIENT_ID                 | service | ✅     | optional; present                                         | Value is configured via service.     |
| TWITCH_CLIENT_SECRET             | service | ✅     | optional; present                                         | Value is configured via service.     |
| YOUTUBE_CLIENT_ID                | service | ✅     | optional; present                                         | Value is configured via service.     |
| YOUTUBE_CLIENT_SECRET            | service | ✅     | optional; present                                         | Value is configured via service.     |

| Health Check                         | Method                  | Target                        | Status     | Summary                                                                                                                                     |
| ------------------------------------ | ----------------------- | ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| transcription-worker-automation-path | railway-ssh-worker-path | AUTOMATION_SERVICE_URL/health | unverified | C:\\Users\\dorts\\AppData\\Roaming\\npm\\railway.cmd ssh -p edb7c5f7-6ee6-475e-9095-eb689f5284e8 -e staging -s transcription-worker node -e |

let target = process.argv[1];
(async () => {
try {
if (!target) {
if (!process.env.AUTOMATION_SERVICE_URL) {
throw new Error("AUTOMATION_SERVICE_URL is not set in the remote service environment.");
}

      target = new URL("/health", process.env.AUTOMATION_SERVICE_URL).toString();
    }

    const response = await fetch(target);
    const body = await response.text();
    process.stdout.write(JSON.stringify({
      body,
      ok: response.ok,
      status: response.status,
      target,
    }));

} catch (error) {
process.stdout.write(JSON.stringify({
error: error instanceof Error ? error.message : String(error),
ok: false,
target,
}));
}
})();
failed with exit code 1: Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource you're trying to use. |

### Redis

| Check             | Target             | Status | Summary                                                                                                                            |
| ----------------- | ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| consistency       | all Redis services | ✅     | REDIS_URL is consistent across all Redis-using services.                                                                           |
| api-gateway-redis | REDIS_URL          | ❌     | C:\\Users\\dorts\\AppData\\Roaming\\npm\\railway.cmd ssh -p edb7c5f7-6ee6-475e-9095-eb689f5284e8 -e staging -s api-gateway node -e |

const { URL } = require("node:url");
const net = require("node:net");

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
process.stdout.write(JSON.stringify({
error: "REDIS_URL is not set in the remote service environment.",
ok: false,
}));
process.exit(0);
}

let parsedUrl;

try {
parsedUrl = new URL(redisUrl);
} catch (error) {
process.stdout.write(JSON.stringify({
error: "REDIS_URL is not a valid absolute URL.",
ok: false,
}));
process.exit(0);
}

const socket = net.connect({
host: parsedUrl.hostname,
port: Number(parsedUrl.port || 6379),
});

socket.setTimeout(5000);

socket.on("connect", () => {
process.stdout.write(JSON.stringify({
ok: true,
target: `${parsedUrl.protocol}//${parsedUrl.host}`,
}));
socket.destroy();
});

socket.on("timeout", () => {
process.stdout.write(JSON.stringify({
error: "Redis TCP connection timed out.",
ok: false,
target: `${parsedUrl.protocol}//${parsedUrl.host}`,
}));
socket.destroy();
});

socket.on("error", (error) => {
process.stdout.write(JSON.stringify({
error: error.message,
ok: false,
target: `${parsedUrl.protocol}//${parsedUrl.host}`,
}));
});
failed with exit code 1: Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource you're trying to use. |

### Prioritized Fixes

#### CRITICAL

- none

#### HIGH

- none

#### LOW

- none

## STAGING_DRIFT

| Service | Variable | Staging | Production | Note |
| ------- | -------- | ------- | ---------- | ---- |
| none    | none     | none    | none       | none |
