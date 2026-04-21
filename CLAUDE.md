# skillz — implementation notes for AI agents

## Context

Private registry + CLI for LLM skills. Personal use (Arturo, <5 machines, <100 skills). Open-source but not a marketplace.

- `packages/cli/` — Bun-compiled standalone binary. TypeScript, Commander, `@clack/prompts`.
- `packages/api/` — Hono on Cloudflare Workers. Neon Postgres via HTTP driver, R2 binding, Resend via fetch.

## Critical rules (don't break these)

1. **`skillz track` is the hot path.** Must exit 0 always. Never stdout. No `@clack/prompts` import (parse cost). No update-checker. No banner. Fetch timeout 2s, fallback to `pending_pings` SQLite queue.
2. **All commands work non-interactively if args are provided.** Clack only engages when `process.stdout.isTTY` and args are missing. If no TTY and args missing, exit 1 with a clear suggestion of which flag to pass.
3. **`neon-http` driver does NOT support multi-query transactions.** For atomic version assignment on push, use a single `INSERT ... SELECT COALESCE(MAX(version), 0) + 1 ...` protected by `UNIQUE(skill_id, version)` with a 2x retry on conflict.
4. **R2 binding has no `createPresignedUrl`.** Downloads go through a proxy endpoint (`GET /skills/download/:key`) that streams `env.R2_BUCKET.get(key).body`.
5. **Telemetry injection block** in SKILL.md is bounded by `<!-- skillz-telemetry-start -->` / `<!-- skillz-telemetry-end -->` HTML comments. Always replace on reinstall, remove on uninstall.
6. **Tokens**: generate 32 random bytes with `crypto.getRandomValues`, return plaintext to client once, store only `sha256(token)` in `devices.token_hash`.
7. **Auth codes**: alphabet excludes `0/O/1/I/L` to avoid ambiguity. Format `SKLZ-XXXX-XXXX-XXXX`. TTL 10min, single-use.

## Build & deploy

```bash
# CLI build (local)
cd packages/cli && bun run build                    # current platform
cd packages/cli && bun run build:all                # 4 platforms

# API dev
cd packages/api && bunx wrangler dev

# API deploy (after `wrangler login` + `wrangler secret put`)
cd packages/api && bunx wrangler deploy

# DB migrations
cd packages/api && bun run db:generate              # generate from schema
cd packages/api && bun run db:migrate               # apply to Neon

# Release CLI
git tag v0.1.0 && git push origin v0.1.0
```

## Single source of truth: root `.env`

All variables live in the repo-root `.env` (gitignored). Two scripts propagate them to the places Cloudflare can't read a file:

```bash
bun run sync:dev-vars       # writes packages/api/.dev.vars for `wrangler dev`
bun run sync:worker-secrets # `wrangler secret put` each key to Cloudflare prod
```

`WORKER_SECRETS` in `scripts/parse-env.ts` controls which `.env` keys get propagated to the Worker (currently: `DATABASE_URL`, `RESEND_API_KEY`, `TOKEN_SIGNING_SECRET`). Values not in that list stay local-only (e.g. `SKILLZ_API_URL` is CLI-only).

**R2 binding** in `wrangler.toml`: `R2_BUCKET` → `skillz-blobs` (not a secret, committed).

**GitHub Actions secrets** (repo settings → Secrets → Actions) — independent from `.env`:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NEON_DATABASE_URL` (for running migrations in CI)

`deploy-api.yml` deploys with `wrangler-action`, which reads secrets already present in Cloudflare — it does **not** push secrets from GH. Rotate by editing the root `.env` locally and re-running `bun run sync:worker-secrets`.

## Local dev

```bash
# From repo root — Bun auto-loads .env into process.env.
bun run sync:dev-vars       # only needed when .env changes
bun run dev:api             # syncs .dev.vars then starts wrangler dev
bun run db:migrate          # uses DATABASE_URL from .env
```

## API URL resolution (CLI)

`SKILLZ_API_URL` is resolved in this order:
1. Compile-time constant baked into the binary via `bun build --define` (see `packages/cli/build.ts` which reads the repo-root `.env`).
2. Runtime env var `SKILLZ_API_URL` (Bun auto-loads `./.env` when you `bun run` from repo root).
3. Hardcoded default in `packages/cli/src/lib/constants.ts`.

**Always run CLI dev commands from repo root** so Bun picks up `.env`:
```bash
bun run packages/cli/src/index.ts whoami
```

In CI, set the repo variable `SKILLZ_API_URL` under Settings → Actions → Variables (not Secrets — the URL is public). If unset, the default in `build.ts` is used.

## File map

See the approved plan at `/Users/arturo/.claude/plans/necesito-que-planees-todo-vast-bumblebee.md`.
