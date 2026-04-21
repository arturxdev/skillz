/// <reference types="@cloudflare/workers-types" />

interface Env {
  // R2 binding
  R2_BUCKET: R2Bucket;

  // Vars (wrangler.toml)
  RESEND_FROM: string;
  APP_VERSION: string;

  // Secrets (wrangler secret put / .dev.vars)
  DATABASE_URL: string;
  RESEND_API_KEY: string;
  TOKEN_SIGNING_SECRET: string;
}
