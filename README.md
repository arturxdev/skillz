# skillz

> Private registry + CLI for managing, versioning, and measuring LLM skills
> (Claude Skills, CLAUDE.md, Cursor Rules) across machines.

## Install

Requires macOS or Linux with `curl`. The install script drops a single
self-contained binary in `~/.skillz/bin/skillz` and prints the `export PATH=...`
line you may need to add to your shell rc file.

```bash
curl -fsSL https://raw.githubusercontent.com/arturxdev/skillz/main/install.sh | sh
skillz --version                 # verify install
skillz link you@example.com      # paste the SKLZ-XXXX-XXXX-XXXX code from email
```

`skillz link` emails a one-time code and enrolls this machine as a device under
your account. Run it once per machine.

## Quickstart

Thirty seconds from zero to a skill installed in your current project:

```bash
skillz link you@example.com              # link this machine (once)
skillz list --remote                     # see what's in the registry
skillz install my-skill --scope=project  # drop it into ./.agents/skills/
skillz list                              # confirm what's installed here
skillz list --outdated                   # anything with a newer version?
skillz update                            # interactive multiselect upgrade
```

Once a skill is installed, its `SKILL.md` contains a `skillz track` line that
the LLM fires when it actually uses the skill — you don't run it by hand.

## Getting help

Everything the CLI can do is discoverable from the CLI itself:

```bash
skillz --help              # top-level command list
skillz install --help      # flags for a single command
skillz version             # installed version + latest release
skillz self-update         # pull the latest binary in-place
skillz whoami              # which email/device is this machine linked as
```

## Lifecycle

### Discover what exists

```bash
skillz list --remote           # all skills in the registry
skillz info <skill>            # description, latest version, hash
skillz versions <skill>        # every published version
```

### Install a skill

Skills live in one of two places. Pick per skill:

- `--scope=project` → `./.agents/skills/<name>/` (recommended; versioned with
  the repo and only loaded by the LLM in that project).
- `--scope=global` → `~/.agents/skills/<name>/` (available in every project).

The canonical install path is `.agents/skills/` — the cross-agent convention
used by **Codex** (OpenAI) and **OpenCode** (sst), so both discover skills
natively. For **Claude Code**, which only reads `.claude/skills/`, skillz
additionally creates a symlink `.claude/skills/<name>` → `.agents/skills/<name>`
so the same install works across all three agents without duplicating files.

```bash
skillz install my-skill --scope=project       # latest version
skillz install my-skill@3 --scope=global      # pin a version
skillz install my-skill --scope=project --force   # reinstall on top
```

Without a target, `skillz install` opens an interactive multiselect of the
registry.

### See what you have

```bash
skillz list                        # everything, both scopes
skillz list --scope=project        # only this project's skills
skillz list --scope=global         # only globally installed
skillz info <skill>                # details for one skill
```

### Keep skills up to date

```bash
skillz list --outdated             # what's behind latest
skillz update                      # interactive picker for upgrades
skillz update my-skill             # upgrade just one
```

### Remove a skill

```bash
skillz remove my-skill             # uninstall from this machine
skillz remove my-skill --purge-stats   # also wipe local usage history
```

### Measure usage

```bash
skillz stats                                 # last 30d, all skills
skillz stats my-skill --last 7d              # one skill, last week
skillz stats --by project                    # aggregate by project
skillz stats --by device                     # aggregate by machine
skillz sync                                  # flush the offline ping queue
```

### Author and publish a skill

Any directory with a `SKILL.md` (with `name:` in its frontmatter) is
publishable. Versions are integers and assigned by the server.

```bash
cd ~/dev/skillz-library/my-skill
skillz push                        # publish a new version from cwd
skillz versions my-skill           # list every version
skillz diff my-skill 2 3           # textual diff between versions
skillz yank my-skill@3             # retract a broken version
```

### Manage devices

```bash
skillz auth devices                # list all machines on your account
skillz auth revoke <device>        # kick a machine off
skillz logout                      # unlink this machine only
```

## Command reference

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
- `skillz list` — list installed / `--remote` / `--outdated`
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
