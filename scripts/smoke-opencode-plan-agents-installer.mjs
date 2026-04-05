#!/usr/bin/env node

import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cliPath = path.join(projectRoot, "bin", "opencode-plan-agents.mjs")

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
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "opencode-plan-agents-smoke-"))
  const sourceDir = path.join(tempRoot, "source")
  const binDir = path.join(tempRoot, "bin")
  const stateDir = path.join(tempRoot, "state")
  const configDir = path.join(tempRoot, "config", "opencode")
  const installArgs = [
    "--source-dir",
    sourceDir,
    "--bin-dir",
    binDir,
    "--state-dir",
    stateDir,
    "--config-dir",
    configDir,
    "--link-name",
    "opencode-test",
  ]

  try {
    await runNode(installArgs)

    const binaryPath = path.join(binDir, "opencode-test")
    await runCommand(binaryPath, ["--version"])
    const config = JSON.parse(await readFile(path.join(configDir, "opencode.json"), "utf8"))
    if (!config.agent?.ask || !config.agent?.plan) {
      throw new Error("managed ASK/PLAN config not found after install")
    }

    await runNode(installArgs)
    await runCommand(binaryPath, ["--version"])

    await runNode([
      "uninstall",
      "--state-dir",
      stateDir,
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
