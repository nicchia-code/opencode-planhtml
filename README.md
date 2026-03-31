# OpenCode Plan HTML

This repo packages a source overlay for OpenCode that upgrades the native `plan` agent.

It does four things:

- patches the PLAN prompt toward structured TDD planning
- renders the final plan to an HTML artifact
- opens that HTML plan in the browser when the plan is actually ready
- keeps the overlay installable directly from GitHub with Bun

## Install From GitHub

Run directly with Bun:

```bash
bunx github:nicchia-code/opencode-planhtml --link-name opencode
```

Or install the helper globally first:

```bash
bun install -g github:nicchia-code/opencode-planhtml
opencode-planhtml --link-name opencode
```

If your shell or runner forwards a literal `--`, the installer ignores it, so `bunx github:nicchia-code/opencode-planhtml -- --link-name opencode` also works.

By default this will:

- clone the pinned upstream OpenCode repo
- apply `patches/opencode-planhtml/opencode-planhtml.patch`
- build the current-platform OpenCode binary
- link it to `~/.local/bin/opencode`

Useful flags:

- `--link-name opencode-dev`
- `--source-dir /custom/source`
- `--bin-dir /custom/bin`
- `--state-dir /custom/state`
- `--repo https://github.com/anomalyco/opencode.git`
- `--ref <commit-or-tag>`
- `--dry-run`

Uninstall:

```bash
opencode-planhtml uninstall --link-name opencode --purge
```

Disable browser auto-open for rendered plans:

```bash
export OPENCODE_DISABLE_PLAN_HTML_AUTO_OPEN=1
```

## Maintainer Commands

```bash
bun install
bun test
bun run typecheck
bun run export:opencode-planhtml-patch
bun run smoke:installer
```

## Layout

- `bin/opencode-planhtml.mjs` - CLI entrypoint used by Bun and global installs
- `src/opencode-planhtml/installer.mjs` - clone / patch / build / link workflow
- `patches/opencode-planhtml/opencode-planhtml.patch` - canonical OpenCode source patch
- `patches/opencode-planhtml/manifest.json` - pinned upstream repo/ref metadata
- `scripts/export-opencode-planhtml-patch.mjs` - regenerates the patch from a local OpenCode checkout
- `scripts/smoke-opencode-planhtml-installer.mjs` - end-to-end installer smoke test
- `tests/opencode-planhtml-installer.test.ts` - unit coverage for installer helpers
