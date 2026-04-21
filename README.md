# skillz

> Private registry + CLI for managing, versioning, and measuring LLM skills
> (Claude Skills, CLAUDE.md, Cursor Rules) across machines.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/arturxdev/skillz/main/install.sh | sh
skillz link you@example.com
```

## Daily loop

```bash
cd ~/dev/skillz-library/my-skill
vim SKILL.md
skillz push              # v2 published
cd ~/dev/some-project
skillz update            # interactive multiselect of upgrades
# [LLM uses the skill → skillz track silent in background]
skillz stats my-skill
```

## Commands

### Auth
- `skillz link [email]` — link this machine
- `skillz whoami` — current device info
- `skillz auth devices` — list linked machines
- `skillz auth revoke [device]` — revoke a device
- `skillz logout` — unlink this machine

### Publish
- `skillz push [path]` — publish skill (auto versioned)
- `skillz versions <skill>` — list versions
- `skillz yank [skill]@[version]` — retract a version
- `skillz diff <skill> <v1> <v2>` — textual diff

### Install
- `skillz install [skill[@version]]` — install (global or project)
- `skillz update [skill]` — upgrade to latest
- `skillz list` — list installed
- `skillz info <skill>` — details
- `skillz remove [skill]` — uninstall

### Telemetry
- `skillz track <skill>` — record activation (called by LLM from SKILL.md)
- `skillz sync` — flush offline queue
- `skillz stats [skill]` — aggregated activations

### Meta
- `skillz version`
- `skillz self-update`

## Architecture

- **CLI**: Bun-compiled standalone binary, Commander + `@clack/prompts`.
- **Backend**: Hono on Cloudflare Workers, Neon Postgres (HTTP driver), R2 for blobs, Resend for email.
- **Auth**: magic code (`SKLZ-XXXX-XXXX-XXXX`) via email, Bearer token per device.

See `CLAUDE.md` for implementation notes.

## License

MIT
