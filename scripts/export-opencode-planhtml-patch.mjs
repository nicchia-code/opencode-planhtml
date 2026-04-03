#!/usr/bin/env node

import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.dirname(scriptDir)

const DEFAULT_OPENCODE_ROOT = path.join(os.homedir(), "Developer", "opencode")
const DEFAULT_REPO_URL = "https://github.com/anomalyco/opencode.git"
const PATCH_DIR = path.join(projectRoot, "patches", "opencode-planhtml")
const PATCH_FILE = path.join(PATCH_DIR, "opencode-planhtml.patch")
const MANIFEST_FILE = path.join(PATCH_DIR, "manifest.json")

const PATCHED_FILES = [
  "bun.lock",
  "packages/app/src/app.tsx",
  "packages/app/src/context/plan-comments.test.ts",
  "packages/app/src/context/plan-comments.ts",
  "packages/app/src/pages/layout.test.tsx",
  "packages/app/src/pages/layout.tsx",
  "packages/app/src/pages/session-plan-types.ts",
  "packages/app/src/pages/session-plan.test.tsx",
  "packages/app/src/pages/session-plan.tsx",
  "packages/opencode/package.json",
  "packages/opencode/src/agent/agent.ts",
  "packages/opencode/src/cli/cmd/tui/routes/session/index.tsx",
  "packages/opencode/src/cli/cmd/tui/worker.ts",
  "packages/opencode/src/flag/flag.ts",
  "packages/opencode/src/server/instance.ts",
  "packages/opencode/src/server/routes/session-plan.ts",
  "packages/opencode/src/session/index.ts",
  "packages/opencode/src/session/plan-action.ts",
  "packages/opencode/src/session/plan-control.ts",
  "packages/opencode/src/session/plan-html.ts",
  "packages/opencode/src/session/plan-server.ts",
  "packages/opencode/src/session/plan-user.ts",
  "packages/opencode/src/session/processor.ts",
  "packages/opencode/src/session/prompt.ts",
  "packages/opencode/src/session/prompt/build-switch.txt",
  "packages/opencode/src/session/prompt/plan.txt",
  "packages/opencode/src/session/prompt/plan-user.txt",
  "packages/opencode/src/tool/plan.ts",
  "packages/opencode/test/server/session-plan.test.ts",
  "packages/opencode/test/session/plan-html.test.ts",
  "packages/opencode/test/session/plan-user.test.ts",
]

function usage() {
  return [
    "Usage: node ./scripts/export-opencode-planhtml-patch.mjs [--opencode-root PATH] [--repo URL] [--ref COMMIT]",
    "",
    `Defaults:`,
    `- OpenCode root: ${DEFAULT_OPENCODE_ROOT}`,
    `- Upstream repo: ${DEFAULT_REPO_URL}`,
  ].join("\n")
}

function parseArgs(argv) {
  const result = {
    opencodeRoot: DEFAULT_OPENCODE_ROOT,
    repo: DEFAULT_REPO_URL,
    ref: "",
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case "--opencode-root":
        result.opencodeRoot = path.resolve(argv[++index] ?? "")
        break
      case "--repo":
        result.repo = argv[++index] ?? ""
        break
      case "--ref":
        result.ref = argv[++index] ?? ""
        break
      case "-h":
      case "--help":
        process.stdout.write(`${usage()}\n`)
        process.exit(0)
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!result.repo) {
    throw new Error("Missing --repo value")
  }

  return result
}

async function runGit(args, workdir) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: workdir, maxBuffer: 16 * 1024 * 1024 })
    return stdout
  } catch (error) {
    if (error && typeof error === "object" && "stdout" in error && "code" in error && error.code === 1) {
      return error.stdout
    }
    throw error
  }
}

async function isTracked(opencodeRoot, filePath) {
  try {
    await execFileAsync("git", ["ls-files", "--error-unmatch", "--", filePath], {
      cwd: opencodeRoot,
      maxBuffer: 16 * 1024 * 1024,
    })
    return true
  } catch {
    return false
  }
}

async function diffForFile(opencodeRoot, filePath) {
  const fullPath = path.join(opencodeRoot, filePath)
  try {
    await fs.access(fullPath)
  } catch {
    throw new Error(`Missing patched file in OpenCode checkout: ${filePath}`)
  }

  if (await isTracked(opencodeRoot, filePath)) {
    const diff = await runGit(["diff", "--binary", "--relative", "--", filePath], opencodeRoot)
    return diff
  }

  const diff = await runGit(["diff", "--binary", "--no-index", "--", "/dev/null", `./${filePath}`], opencodeRoot)
  return diff.replaceAll("a/./", "a/").replaceAll("b/./", "b/")
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const ref = options.ref || (await runGit(["rev-parse", "HEAD"], options.opencodeRoot)).trim()

  const diffs = []
  for (const filePath of PATCHED_FILES) {
    const diff = await diffForFile(options.opencodeRoot, filePath)
    if (!diff.trim()) {
      throw new Error(`No diff found for tracked file ${filePath}; update the file list or make sure changes exist.`)
    }
    diffs.push(diff.trimEnd())
  }

  await fs.mkdir(PATCH_DIR, { recursive: true })
  await fs.writeFile(PATCH_FILE, `${diffs.join("\n\n")}\n`, "utf8")
  await fs.writeFile(
    MANIFEST_FILE,
    `${JSON.stringify(
      {
        repo: options.repo,
        ref,
        patchFile: "patches/opencode-planhtml/opencode-planhtml.patch",
        packageDir: "packages/opencode",
        files: PATCHED_FILES,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  )

  process.stdout.write(`Wrote ${PATCH_FILE}\n`)
  process.stdout.write(`Wrote ${MANIFEST_FILE}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
