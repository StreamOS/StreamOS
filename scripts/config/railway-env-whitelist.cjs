const API_GATEWAY_REQUIRED = [
  "NODE_ENV",
  "HOST",
  "PORT",
  "REDIS_URL",
  "QUEUE_DEFAULT_NAME",
  "CLIP_GENERATION_QUEUE_NAME",
  "TRANSCRIPTION_QUEUE_NAME",
  "CLIP_WORKER_CONCURRENCY",
  "API_GATEWAY_SECRET",
  "API_GATEWAY_ALLOWED_ORIGINS",
  "CONNECT_SUCCESS_REDIRECT",
  "API_GATEWAY_RATE_LIMIT_MAX",
  "API_GATEWAY_RATE_LIMIT_WINDOW_MS",
  "STREAM_EVENT_WEBHOOK_SECRET",
  "APP_ENCRYPTION_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "YOUTUBE_REDIRECT_URI",
  "YOUTUBE_SCOPES",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "TIKTOK_REDIRECT_URI",
  "TIKTOK_SCOPES",
  "KICK_CLIENT_ID",
  "KICK_CLIENT_SECRET",
  "KICK_REDIRECT_URI",
  "KICK_SCOPES",
  "KICK_WEBHOOK_SECRET",
  "RAILWAY_HEALTHCHECK_TIMEOUT_SEC",
];

const AUTOMATION_SERVICE_REQUIRED = [
  "HOST",
  "PORT",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_TITLE_MODEL",
  "OPENAI_TRANSCRIPTION_MODEL",
  "OPENAI_BASE_URL",
  "OPENAI_TIMEOUT_SECONDS",
  "OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES",
  "REPLICATE_API_TOKEN",
  "STREAMOS_E2E_MODE",
  "TRANSCRIPTION_PROCESSOR_MODE",
  "RAILWAY_HEALTHCHECK_TIMEOUT_SEC",
];

const TRANSCRIPTION_WORKER_REQUIRED = [
  "REDIS_URL",
  "TRANSCRIPTION_QUEUE_NAME",
  "TRANSCRIPTION_WORKER_CONCURRENCY",
  "CLIP_WORKER_CONCURRENCY",
  "AUTOMATION_SERVICE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const CONTENT_JOB_RETRY_REQUIRED = [
  "REDIS_URL",
  "CLIP_GENERATION_QUEUE_NAME",
  "TRANSCRIPTION_QUEUE_NAME",
  "CLIP_WORKER_CONCURRENCY",
  "CONTENT_JOB_RETRY_WORKER_BATCH_SIZE",
  "CONTENT_JOB_RETRY_WORKER_POLL_INTERVAL_MS",
  "CONTENT_JOB_RETRY_ATTEMPTS",
  "CONTENT_JOB_RETRY_BACKOFF_MS",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const CLIP_WORKER_REQUIRED = [
  "REDIS_URL",
  "AUTOMATION_SERVICE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

module.exports = {
  project: {
    id: "edb7c5f7-6ee6-475e-9095-eb689f5284e8",
    name: "terrific-reflection",
  },
  environments: ["staging", "production"],
  forbiddenRailwayPatterns: [
    "NEXT_PUBLIC_*",
    "TWITCH_*",
    "APP_ENV",
    "STREAMOS_DEMO_MODE",
  ],
  platformManagedPatterns: ["RAILWAY_*"],
  sensitiveNamePatterns: [
    "_API_KEY",
    "_SECRET",
    "_TOKEN",
    "SERVICE_ROLE_KEY",
    "APP_ENCRYPTION_KEY",
  ],
  priorityMap: {
    default: {
      DANGEROUS_EXPOSURE: "CRITICAL",
      DUPLICATE: "LOW",
      HEALTHCHECK_FAILED: "CRITICAL",
      INVALID_FORMAT: "HIGH",
      MISSING: "HIGH",
      STAGING_DRIFT: "LOW",
      WRONG_SCOPE: "HIGH",
      WRONG_SERVICE: "HIGH",
    },
    productionCriticalInvalid: [
      "API_GATEWAY_SECRET",
      "APP_ENCRYPTION_KEY",
      "AUTOMATION_SERVICE_URL",
      "NODE_ENV",
      "STREAM_EVENT_WEBHOOK_SECRET",
      "TRANSCRIPTION_PROCESSOR_MODE",
    ],
    productionCriticalMissing: [
      "API_GATEWAY_SECRET",
      "APP_ENCRYPTION_KEY",
      "AUTOMATION_SERVICE_URL",
      "NODE_ENV",
      "STREAM_EVENT_WEBHOOK_SECRET",
    ],
  },
  validators: {
    byVariable: {
      API_GATEWAY_ALLOWED_ORIGINS: {
        kind: "csv-urls",
        protocols: ["http:", "https:"],
        rejectPrivateHosts: true,
      },
      API_GATEWAY_RATE_LIMIT_ENABLED: {
        kind: "boolean",
      },
      API_GATEWAY_RATE_LIMIT_MAX: {
        kind: "integer",
        min: 1,
      },
      API_GATEWAY_RATE_LIMIT_WINDOW_MS: {
        kind: "integer",
        min: 1,
      },
      API_GATEWAY_SECRET: {
        kind: "string",
      },
      APP_ENCRYPTION_KEY: {
        kind: "base64-32-bytes",
      },
      AUTOMATION_SERVICE_URL: {
        kind: "automation-url",
      },
      CLIP_GENERATION_QUEUE_NAME: {
        kind: "string",
      },
      CLIP_WORKER_CONCURRENCY: {
        kind: "integer",
        max: 25,
        min: 1,
      },
      CONNECT_SUCCESS_REDIRECT: {
        kind: "url",
        protocols: ["http:", "https:"],
      },
      CONTENT_JOB_RETRY_ATTEMPTS: {
        kind: "integer",
        max: 10,
        min: 1,
      },
      CONTENT_JOB_RETRY_BACKOFF_MS: {
        kind: "integer",
        max: 3_600_000,
        min: 1_000,
      },
      CONTENT_JOB_RETRY_WORKER_BATCH_SIZE: {
        kind: "integer",
        max: 100,
        min: 1,
      },
      CONTENT_JOB_RETRY_WORKER_POLL_INTERVAL_MS: {
        kind: "integer",
        max: 3_600_000,
        min: 5_000,
      },
      HOST: {
        kind: "string",
      },
      KICK_CLIENT_ID: {
        kind: "string",
      },
      KICK_CLIENT_SECRET: {
        kind: "string",
      },
      KICK_REDIRECT_URI: {
        kind: "url",
        protocols: ["http:", "https:"],
      },
      KICK_SCOPES: {
        kind: "scopes",
      },
      KICK_WEBHOOK_SECRET: {
        kind: "string",
      },
      NODE_ENV: {
        allowed: ["development", "production", "staging", "test"],
        kind: "enum",
      },
      OPENAI_API_KEY: {
        kind: "string",
      },
      OPENAI_BASE_URL: {
        kind: "url",
        protocols: ["http:", "https:"],
      },
      OPENAI_MAX_TRANSCRIPTION_MEDIA_BYTES: {
        kind: "integer",
        min: 1,
      },
      OPENAI_MODEL: {
        kind: "string",
      },
      OPENAI_TIMEOUT_SECONDS: {
        kind: "number",
        min: 0.001,
      },
      OPENAI_TITLE_MODEL: {
        kind: "string",
      },
      OPENAI_TRANSCRIPTION_MODEL: {
        kind: "string",
      },
      PORT: {
        kind: "integer",
        max: 65535,
        min: 1,
      },
      QUEUE_DEFAULT_NAME: {
        kind: "string",
      },
      RAILWAY_HEALTHCHECK_TIMEOUT_SEC: {
        kind: "integer",
        min: 1,
      },
      REDIS_URL: {
        kind: "url",
        protocols: ["redis:", "rediss:"],
      },
      REPLICATE_API_TOKEN: {
        kind: "string",
      },
      STREAMOS_E2E_MODE: {
        kind: "boolean",
      },
      STREAMOS_PUBLIC_URL: {
        kind: "url",
        protocols: ["http:", "https:"],
      },
      STREAM_EVENT_WEBHOOK_SECRET: {
        kind: "string",
      },
      STREAM_JOB_QUEUE_NAME: {
        kind: "string",
      },
      SUPABASE_SERVICE_ROLE_KEY: {
        kind: "string",
      },
      SUPABASE_URL: {
        kind: "url",
        protocols: ["http:", "https:"],
      },
      TIKTOK_CLIENT_KEY: {
        kind: "string",
      },
      TIKTOK_CLIENT_SECRET: {
        kind: "string",
      },
      TIKTOK_REDIRECT_URI: {
        kind: "url",
        protocols: ["http:", "https:"],
      },
      TIKTOK_SCOPES: {
        kind: "scopes",
      },
      TRANSCRIPTION_PROCESSOR_MODE: {
        allowed: ["openai", "stub", "fail"],
        kind: "enum",
      },
      TRANSCRIPTION_QUEUE_NAME: {
        kind: "string",
      },
      TRANSCRIPTION_WORKER_CONCURRENCY: {
        kind: "integer",
        max: 25,
        min: 1,
      },
      YOUTUBE_CLIENT_ID: {
        kind: "string",
      },
      YOUTUBE_CLIENT_SECRET: {
        kind: "string",
      },
      YOUTUBE_CONNECT_SUCCESS_REDIRECT: {
        kind: "url",
        protocols: ["http:", "https:"],
      },
      YOUTUBE_REDIRECT_URI: {
        kind: "url",
        protocols: ["http:", "https:"],
      },
      YOUTUBE_SCOPES: {
        kind: "scopes",
      },
      YOUTUBE_WEBHOOK_SECRET: {
        kind: "string",
      },
      YOUTUBE_WEBSUB_SECRET: {
        kind: "string",
      },
      YOUTUBE_WEBSUB_VERIFY_TOKEN: {
        kind: "string",
      },
    },
  },
  services: {
    "api-gateway": {
      health: {
        expectedService: "api-gateway",
        localPortVar: "PORT",
        publicUrlPreferred: true,
      },
      optional: [
        "API_GATEWAY_RATE_LIMIT_ENABLED",
        "STREAMOS_PUBLIC_URL",
        "YOUTUBE_CONNECT_SUCCESS_REDIRECT",
        "YOUTUBE_WEBHOOK_SECRET",
        "YOUTUBE_WEBSUB_SECRET",
        "YOUTUBE_WEBSUB_VERIFY_TOKEN",
      ],
      publicNetworking: "required",
      required: API_GATEWAY_REQUIRED,
      runtime: "node",
    },
    "automation-service": {
      health: {
        expectedService: "automation-service",
        localPortVar: "PORT",
        publicUrlPreferred: false,
      },
      optional: [],
      publicNetworking: "disabled",
      required: AUTOMATION_SERVICE_REQUIRED,
      runtime: "python",
    },
    "content-job-retry-worker": {
      optional: ["QUEUE_DEFAULT_NAME"],
      publicNetworking: "disabled",
      required: CONTENT_JOB_RETRY_REQUIRED,
      runtime: "node",
    },
    "clip-worker": {
      optional: [
        "CLIP_WORKER_CONCURRENCY",
        "CLIP_GENERATION_QUEUE_NAME",
        "QUEUE_DEFAULT_NAME",
      ],
      publicNetworking: "disabled",
      required: CLIP_WORKER_REQUIRED,
      runtime: "node",
    },
    "transcription-worker": {
      optional: [
        "CLIP_GENERATION_QUEUE_NAME",
        "QUEUE_DEFAULT_NAME",
        "STREAM_JOB_QUEUE_NAME",
      ],
      publicNetworking: "disabled",
      required: TRANSCRIPTION_WORKER_REQUIRED,
      runtime: "node",
    },
  },
};
