import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(moduleDir, "..", "..")
const patchDir = path.join(repoRoot, "patches", "opencode-planhtml")
const manifestPath = path.join(patchDir, "manifest.json")

const platformMap = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
}

const archMap = {
  x64: "x64",
  arm64: "arm64",
  arm: "arm",
}

function resolveHome(home = os.homedir()) {
  return path.resolve(home)
}

export function defaultPaths(env = process.env, home = os.homedir()) {
  const resolvedHome = resolveHome(home)
  const dataHome = env.XDG_DATA_HOME ? path.resolve(env.XDG_DATA_HOME) : path.join(resolvedHome, ".local", "share")
  const stateHome = env.XDG_STATE_HOME ? path.resolve(env.XDG_STATE_HOME) : path.join(resolvedHome, ".local", "state")
  return {
    binDir: path.join(resolvedHome, ".local", "bin"),
    sourceDir: path.join(dataHome, "opencode-planhtml", "source"),
    stateDir: path.join(stateHome, "opencode-planhtml"),
  }
}

export function builtBinaryRelativePath(platform = process.platform, arch = process.arch) {
  const platformLabel = platformMap[platform] ?? platform
  const archLabel = archMap[arch] ?? arch
  const binary = platform === "win32" ? "opencode.exe" : "opencode"
  return path.join("packages", "opencode", "dist", `opencode-${platformLabel}-${archLabel}`, "bin", binary)
}

export function parseCliArgs(argv) {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "install"
  const args = command === "install" ? argv.slice(argv[0] === command ? 1 : 0) : argv.slice(1)
  const result = {
    command,
    dryRun: false,
    purge: false,
    linkName: "opencode",
    repo: "",
    ref: "",
    sourceDir: "",
    binDir: "",
    stateDir: "",
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    switch (arg) {
      case "--dry-run":
        result.dryRun = true
        break
      case "--purge":
        result.purge = true
        break
      case "--repo":
        result.repo = args[++index] ?? ""
        break
      case "--ref":
        result.ref = args[++index] ?? ""
        break
      case "--source-dir":
        result.sourceDir = path.resolve(args[++index] ?? "")
        break
      case "--bin-dir":
        result.binDir = path.resolve(args[++index] ?? "")
        break
      case "--state-dir":
        result.stateDir = path.resolve(args[++index] ?? "")
        break
      case "--link-name":
        result.linkName = args[++index] ?? ""
        break
      case "-h":
      case "--help":
        result.command = "help"
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return result
}

function usage() {
  return [
    "Usage:",
    "  opencode-planhtml [install] [--repo URL] [--ref COMMIT] [--link-name NAME] [--source-dir PATH] [--bin-dir PATH] [--state-dir PATH] [--dry-run]",
    "  opencode-planhtml uninstall [--bin-dir PATH] [--state-dir PATH] [--link-name NAME] [--purge] [--dry-run]",
    "  opencode-planhtml info [--state-dir PATH] [--bin-dir PATH] [--link-name NAME]",
    "",
    "Default command: install",
    "Typical GitHub usage:",
    "  bunx github:nicchia-code/opencode-planhtml -- --link-name opencode",
    "  bun install -g github:nicchia-code/opencode-planhtml && opencode-planhtml --link-name opencode",
  ].join("\n")
}

async function readManifest() {
  return JSON.parse(await fs.readFile(manifestPath, "utf8"))
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function run(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) return resolve()
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? 1}`))
    })
  })
}

async function gitOutput(args, cwd) {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, env: process.env, stdio: ["ignore", "pipe", "inherit"] })
    let stdout = ""
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) return resolve(stdout.trim())
      reject(new Error(`git ${args.join(" ")} failed with exit code ${code ?? 1}`))
    })
  })
}

async function ensureCleanSourceDir(sourceDir, repo, ref) {
  if (!(await fileExists(path.join(sourceDir, ".git")))) {
    await fs.rm(sourceDir, { recursive: true, force: true })
    await fs.mkdir(path.dirname(sourceDir), { recursive: true })
    await run("git", ["clone", repo, sourceDir])
  }

  await run("git", ["fetch", "--all", "--tags", "--prune"], { cwd: sourceDir })
  await run("git", ["reset", "--hard", ref], { cwd: sourceDir })
  await run("git", ["clean", "-fd"], { cwd: sourceDir })
}

async function applyPatch(sourceDir, patchFile) {
  await run("git", ["apply", "--check", patchFile], { cwd: sourceDir })
  await run("git", ["apply", patchFile], { cwd: sourceDir })
}

function stateFilePath(stateDir) {
  return path.join(stateDir, "install.json")
}

async function readState(stateDir) {
  try {
    return JSON.parse(await fs.readFile(stateFilePath(stateDir), "utf8"))
  } catch {
    return undefined
  }
}

async function writeState(stateDir, data) {
  await fs.mkdir(stateDir, { recursive: true })
  await fs.writeFile(stateFilePath(stateDir), `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

async function removeState(stateDir) {
  await fs.rm(stateFilePath(stateDir), { force: true })
}

function timestampSuffix() {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

async function prepareLink(linkPath, state) {
  let backupPath
  try {
    const stat = await fs.lstat(linkPath)
    if (stat.isSymbolicLink()) {
      await fs.rm(linkPath, { force: true })
    } else {
      backupPath = `${linkPath}.bak-${timestampSuffix()}`
      await fs.rename(linkPath, backupPath)
    }
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error
  }

  if (!backupPath && state?.backupPath) {
    backupPath = state.backupPath
  }

  return backupPath
}

function printInstallSummary(data) {
  process.stdout.write(`Patched OpenCode installed.\n`)
  process.stdout.write(`- Source: ${data.sourceDir}\n`)
  process.stdout.write(`- Binary: ${data.binaryPath}\n`)
  process.stdout.write(`- Link: ${data.linkPath}\n`)
  process.stdout.write(`- Upstream: ${data.repo} @ ${data.ref}\n`)
  if (!process.env.PATH?.split(path.delimiter).includes(path.dirname(data.linkPath))) {
    process.stdout.write(`- Note: ${path.dirname(data.linkPath)} is not currently in PATH.\n`)
  }
}

async function install(options) {
  const defaults = defaultPaths()
  const manifest = await readManifest()
  const sourceDir = options.sourceDir || defaults.sourceDir
  const binDir = options.binDir || defaults.binDir
  const stateDir = options.stateDir || defaults.stateDir
  const repo = options.repo || manifest.repo
  const ref = options.ref || manifest.ref
  const linkPath = path.join(binDir, options.linkName)
  const patchFile = path.join(repoRoot, manifest.patchFile)
  const binaryPath = path.join(sourceDir, builtBinaryRelativePath())

  if (options.dryRun) {
    process.stdout.write(`Would clone/reset ${repo} @ ${ref} into ${sourceDir}\n`)
    process.stdout.write(`Would apply patch ${patchFile}\n`)
    process.stdout.write(`Would build ${binaryPath}\n`)
    process.stdout.write(`Would link ${linkPath} -> ${binaryPath}\n`)
    return
  }

  const previousState = await readState(stateDir)

  await ensureCleanSourceDir(sourceDir, repo, ref)
  await applyPatch(sourceDir, patchFile)
  await run("bun", ["install"], { cwd: sourceDir })
  await run("bun", ["run", "script/build.ts", "--single"], { cwd: path.join(sourceDir, manifest.packageDir) })

  if (!(await fileExists(binaryPath))) {
    throw new Error(`Built binary not found at ${binaryPath}`)
  }

  await fs.mkdir(binDir, { recursive: true })
  const backupPath = await prepareLink(linkPath, previousState)
  await fs.symlink(binaryPath, linkPath)

  const nextState = {
    repo,
    ref,
    sourceDir,
    binaryPath,
    linkPath,
    backupPath,
    patchFile,
    installedAt: new Date().toISOString(),
  }
  await writeState(stateDir, nextState)
  printInstallSummary(nextState)
}

async function uninstall(options) {
  const defaults = defaultPaths()
  const stateDir = options.stateDir || defaults.stateDir
  const state = await readState(stateDir)
  const binDir = options.binDir || defaults.binDir
  const linkPath = state?.linkPath || path.join(binDir, options.linkName)

  if (options.dryRun) {
    process.stdout.write(`Would remove ${linkPath}\n`)
    if (state?.backupPath) process.stdout.write(`Would restore backup ${state.backupPath}\n`)
    if (options.purge && state?.sourceDir) process.stdout.write(`Would purge ${state.sourceDir}\n`)
    return
  }

  await fs.rm(linkPath, { force: true })
  if (state?.backupPath && (await fileExists(state.backupPath))) {
    await fs.rename(state.backupPath, linkPath)
  }
  if (options.purge && state?.sourceDir) {
    await fs.rm(state.sourceDir, { recursive: true, force: true })
  }
  await removeState(stateDir)
  process.stdout.write(`Removed ${linkPath}\n`)
}

async function info(options) {
  const defaults = defaultPaths()
  const stateDir = options.stateDir || defaults.stateDir
  const state = await readState(stateDir)
  const manifest = await readManifest()
  process.stdout.write(`${JSON.stringify({ manifest, defaults, state }, null, 2)}\n`)
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv)

  if (options.command === "help") {
    process.stdout.write(`${usage()}\n`)
    return
  }

  switch (options.command) {
    case "install":
      await install(options)
      return
    case "uninstall":
      await uninstall(options)
      return
    case "info":
      await info(options)
      return
    default:
      throw new Error(`Unsupported command: ${options.command}`)
  }
}
