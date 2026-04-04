# OpenCode Plan HTML Overlay

This folder contains the source patch for the OpenCode plan HTML workflow overlay.

It patches upstream OpenCode so that the native planning flow can:

- require TDD-oriented todos
- expose an `ask` mode that stays read-only and answers directly
- render a structured HTML plan artifact
- open the rendered HTML plan in the browser when the plan is ready
- dedupe repeated auto-opens for unchanged plan versions

The patch file is generated from a local OpenCode checkout with:

```bash
node ./scripts/export-opencode-planhtml-patch.mjs --opencode-root /path/to/opencode
```

The installer CLI in this repo consumes `manifest.json` and `opencode-planhtml.patch` to clone, patch, build, and link a patched OpenCode binary.
