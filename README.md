# OpenCode Plan Agents

This branch packages a non-patching OpenCode installer.

It does three things:

- installs vanilla OpenCode from source
- adds a custom primary `ask` agent
- overrides the built-in `plan` prompt with the structured planning prompt from this repo

The OpenCode core stays upstream and unpatched.

## Install From GitHub

Run directly with Bun:

```bash
bunx github:nicchia-code/opencode-planhtml#plugin-agents --link-name opencode
```

Or install the helper globally first:

```bash
bun install -g github:nicchia-code/opencode-planhtml#plugin-agents
opencode-plan-agents --link-name opencode
```

If you already have `opencode` installed and only want the agents/config:

```bash
bunx github:nicchia-code/opencode-planhtml#plugin-agents --config-only
```

By default this will:

- clone the pinned upstream OpenCode repo
- build the current-platform OpenCode binary
- link it to `~/.local/bin/opencode`
- write global OpenCode config in `~/.config/opencode`
- add `ask` and override `plan`

Useful flags:

- `--link-name opencode-dev`
- `--source-dir /custom/source`
- `--bin-dir /custom/bin`
- `--state-dir /custom/state`
- `--config-dir /custom/opencode-config`
- `--repo https://github.com/anomalyco/opencode.git`
- `--ref <commit-or-tag>`
- `--config-only`
- `--dry-run`

Uninstall:

```bash
opencode-plan-agents uninstall --purge
```

The uninstall restores the previous `agent.plan` and `agent.ask` entries from the saved install state.

## Installed Behavior

- `ask`: read-only investigation and direct answer mode
- `plan`: structured TDD-oriented planning prompt
- `build`: untouched upstream behavior

This branch does not add HTML rendering, review UI, or plan file patching.

## Maintainer Commands

```bash
bun install
bun test
bun run typecheck
bun run smoke:installer
```

## Layout

- `bin/opencode-plan-agents.mjs` - CLI entrypoint used by Bun and global installs
- `src/opencode-planhtml/installer.mjs` - clone / build / link / config workflow
- `assets/opencode-plan-agents/manifest.json` - pinned upstream repo/ref metadata
- `assets/opencode-plan-agents/prompts/` - managed `ask` and `plan` prompt templates
- `scripts/smoke-opencode-plan-agents-installer.mjs` - end-to-end installer smoke test
- `tests/opencode-planhtml-installer.test.ts` - unit coverage for installer helpers
