#!/usr/bin/env node

import { main } from "../src/opencode-planhtml/installer.mjs"

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
