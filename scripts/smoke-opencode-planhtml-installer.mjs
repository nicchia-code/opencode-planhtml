#!/usr/bin/env node

import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cliPath = path.join(projectRoot, "bin", "opencode-planhtml.mjs")

async function runNode(args) {
  await execFileAsync("node", [cliPath, ...args], {
    cwd: projectRoot,
    maxBuffer: 16 * 1024 * 1024,
    stdio: "inherit",
  })
}

async function runCommand(command, args) {
  await execFileAsync(command, args, {
    cwd: projectRoot,
    maxBuffer: 16 * 1024 * 1024,
    stdio: "inherit",
  })
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opencode-planhtml-smoke-"))
  const sourceDir = path.join(tempRoot, "source")
  const binDir = path.join(tempRoot, "bin")
  const stateDir = path.join(tempRoot, "state")

  try {
    await runNode([
      "--source-dir",
      sourceDir,
      "--bin-dir",
      binDir,
      "--state-dir",
      stateDir,
      "--link-name",
      "opencode-test",
    ])

    const binaryPath = path.join(binDir, "opencode-test")
    await runCommand(binaryPath, ["--version"])

    await runNode([
      "uninstall",
      "--bin-dir",
      binDir,
      "--state-dir",
      stateDir,
      "--link-name",
      "opencode-test",
      "--purge",
    ])
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
