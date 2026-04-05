import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(moduleDir, "..", "..")
const assetDir = path.join(repoRoot, "assets", "opencode-plan-agents")
const manifestPath = path.join(assetDir, "manifest.json")
const promptTemplateDir = path.join(assetDir, "prompts")
const configSchema = "https://opencode.ai/config.json"
const managedPromptRelativeDir = "prompts/opencode-plan-agents"
const managedPromptRefs = {
  ask: `./${managedPromptRelativeDir}/ask.txt`,
  plan: `./${managedPromptRelativeDir}/plan.txt`,
}

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
  const configHome = env.XDG_CONFIG_HOME ? path.resolve(env.XDG_CONFIG_HOME) : path.join(resolvedHome, ".config")
  return {
    binDir: path.join(resolvedHome, ".local", "bin"),
    sourceDir: path.join(dataHome, "opencode-plan-agents", "source"),
    stateDir: path.join(stateHome, "opencode-plan-agents"),
    configDir: path.join(configHome, "opencode"),
  }
}

export function builtBinaryRelativePath(platform = process.platform, arch = process.arch) {
  const platformLabel = platformMap[platform] ?? platform
  const archLabel = archMap[arch] ?? arch
  const binary = platform === "win32" ? "opencode.exe" : "opencode"
  return path.join("packages", "opencode", "dist", `opencode-${platformLabel}-${archLabel}`, "bin", binary)
}

function sanitizeCliArgs(argv) {
  return argv.map(String).filter((arg) => arg !== "--")
}

export function parseCliArgs(argv) {
  const sanitizedArgv = sanitizeCliArgs(argv)
  const command = sanitizedArgv[0] && !sanitizedArgv[0].startsWith("-") ? sanitizedArgv[0] : "install"
  const args = command === "install" ? sanitizedArgv.slice(sanitizedArgv[0] === command ? 1 : 0) : sanitizedArgv.slice(1)
  const result = {
    command,
    dryRun: false,
    purge: false,
    configOnly: false,
    linkName: "opencode",
    repo: "",
    ref: "",
    sourceDir: "",
    binDir: "",
    stateDir: "",
    configDir: "",
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
      case "--config-only":
        result.configOnly = true
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
      case "--config-dir":
        result.configDir = path.resolve(args[++index] ?? "")
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
    "  opencode-plan-agents [install] [--repo URL] [--ref COMMIT] [--link-name NAME] [--source-dir PATH] [--bin-dir PATH] [--state-dir PATH] [--config-dir PATH] [--config-only] [--dry-run]",
    "  opencode-plan-agents uninstall [--state-dir PATH] [--purge] [--dry-run]",
    "  opencode-plan-agents info [--state-dir PATH] [--config-dir PATH] [--bin-dir PATH]",
    "",
    "Default command: install",
    "Typical GitHub usage:",
    "  bunx github:nicchia-code/opencode-planhtml#plugin-agents --link-name opencode",
    "  bun install -g github:nicchia-code/opencode-planhtml#plugin-agents && opencode-plan-agents --link-name opencode",
    "  bunx github:nicchia-code/opencode-planhtml#plugin-agents --config-only",
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

  if (!backupPath && state?.backupPath && state.linkPath === linkPath) {
    backupPath = state.backupPath
  }

  return backupPath
}

function cloneJson(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function ensureConfigObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a JSON object`)
  }
  return value
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"))
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback
    throw error
  }
}

async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

function managedPromptPaths(configDir) {
  const dir = path.join(configDir, "prompts", "opencode-plan-agents")
  return {
    dir,
    askPath: path.join(dir, "ask.txt"),
    planPath: path.join(dir, "plan.txt"),
  }
}

export function managedPlanAgentConfig(promptRef = managedPromptRefs.plan) {
  return {
    prompt: `{file:${promptRef}}`,
  }
}

export function managedAskAgentConfig(promptRef = managedPromptRefs.ask) {
  return {
    description: "Analysis mode. Researches and answers directly without executing or drafting a plan artifact.",
    mode: "primary",
    color: "#ef4444",
    prompt: `{file:${promptRef}}`,
    tools: {
      write: false,
      edit: false,
      bash: false,
      task: false,
      todowrite: false,
      apply_patch: false,
    },
  }
}

function captureConfigBackup(existingConfig, configExistedBefore) {
  const config = ensureConfigObject(cloneJson(existingConfig ?? {}), "OpenCode config")
  let agent = {}
  if (config.agent !== undefined) {
    agent = ensureConfigObject(config.agent, "OpenCode config.agent")
  }
  return {
    configExistedBefore,
    previousPlanAgent: cloneJson(agent.plan),
    previousAskAgent: cloneJson(agent.ask),
  }
}

export function applyManagedAgentConfig(existingConfig, refs = managedPromptRefs) {
  const next = ensureConfigObject(cloneJson(existingConfig ?? {}), "OpenCode config")
  const agent = next.agent === undefined ? {} : ensureConfigObject(cloneJson(next.agent), "OpenCode config.agent")

  next.$schema ??= configSchema
  agent.plan = {
    ...(isPlainObject(agent.plan) ? agent.plan : {}),
    ...managedPlanAgentConfig(refs.plan),
  }
  agent.ask = {
    ...(isPlainObject(agent.ask) ? agent.ask : {}),
    ...managedAskAgentConfig(refs.ask),
  }
  next.agent = agent
  return next
}

function isConfigEffectivelyEmpty(config) {
  return Object.entries(config).every(([key, value]) => {
    if (key === "$schema") return true
    if (key === "agent" && isPlainObject(value) && Object.keys(value).length === 0) return true
    return false
  })
}

export function restoreManagedAgentConfig(currentConfig, backup) {
  const next = ensureConfigObject(cloneJson(currentConfig ?? {}), "OpenCode config")
  const agent = next.agent === undefined ? {} : ensureConfigObject(cloneJson(next.agent), "OpenCode config.agent")

  if (backup.previousPlanAgent === undefined) delete agent.plan
  else agent.plan = cloneJson(backup.previousPlanAgent)

  if (backup.previousAskAgent === undefined) delete agent.ask
  else agent.ask = cloneJson(backup.previousAskAgent)

  if (Object.keys(agent).length === 0) delete next.agent
  else next.agent = agent

  if (!backup.configExistedBefore && isConfigEffectivelyEmpty(next)) {
    return undefined
  }

  return next
}

async function copyPromptTemplate(sourceName, destinationPath) {
  const sourcePath = path.join(promptTemplateDir, sourceName)
  await fs.mkdir(path.dirname(destinationPath), { recursive: true })
  await fs.copyFile(sourcePath, destinationPath)
}

async function cleanupEmptyDirs(startDir, stopDir) {
  let current = startDir
  while (current.startsWith(stopDir)) {
    if (current === stopDir) return
    let entries = []
    try {
      entries = await fs.readdir(current)
    } catch {
      return
    }
    if (entries.length > 0) return
    await fs.rmdir(current).catch(() => undefined)
    current = path.dirname(current)
  }
}

async function installManagedConfig(configDir, previousConfigState) {
  const configPath = path.join(configDir, "opencode.json")
  const prompts = managedPromptPaths(configDir)
  const configExistedBefore = await fileExists(configPath)
  const existingConfig = await readJsonFile(configPath, {})
  const backup = previousConfigState?.configDir === configDir
    ? previousConfigState
    : captureConfigBackup(existingConfig, configExistedBefore)

  await copyPromptTemplate("ask.txt", prompts.askPath)
  await copyPromptTemplate("plan.txt", prompts.planPath)

  const nextConfig = applyManagedAgentConfig(existingConfig)
  await writeJsonFile(configPath, nextConfig)

  return {
    ...backup,
    configDir,
    configPath,
    promptDir: prompts.dir,
    askPromptPath: prompts.askPath,
    planPromptPath: prompts.planPath,
  }
}

async function uninstallManagedConfig(configState) {
  if (!configState) return

  const currentConfig = await readJsonFile(configState.configPath, undefined)
  if (currentConfig !== undefined) {
    const restored = restoreManagedAgentConfig(currentConfig, configState)
    if (restored === undefined) {
      await fs.rm(configState.configPath, { force: true })
    } else {
      await writeJsonFile(configState.configPath, restored)
    }
  }

  await fs.rm(configState.askPromptPath, { force: true })
  await fs.rm(configState.planPromptPath, { force: true })
  await cleanupEmptyDirs(configState.promptDir, configState.configDir)
}

function printInstallSummary(data) {
  process.stdout.write(`OpenCode plan agents installed.\n`)
  if (data.linkPath && data.binaryPath) {
    process.stdout.write(`- Binary: ${data.binaryPath}\n`)
    process.stdout.write(`- Link: ${data.linkPath}\n`)
    process.stdout.write(`- Upstream: ${data.repo} @ ${data.ref}\n`)
    if (!process.env.PATH?.split(path.delimiter).includes(path.dirname(data.linkPath))) {
      process.stdout.write(`- Note: ${path.dirname(data.linkPath)} is not currently in PATH.\n`)
    }
  } else {
    process.stdout.write(`- Binary: unchanged (config-only install)\n`)
  }
  process.stdout.write(`- Config: ${data.config?.configPath}\n`)
  process.stdout.write(`- Agents: custom ASK + overridden PLAN\n`)
}

async function install(options) {
  const defaults = defaultPaths()
  const manifest = await readManifest()
  const sourceDir = options.sourceDir || defaults.sourceDir
  const binDir = options.binDir || defaults.binDir
  const stateDir = options.stateDir || defaults.stateDir
  const configDir = options.configDir || defaults.configDir
  const repo = options.repo || manifest.repo
  const ref = options.ref || manifest.ref
  const linkPath = path.join(binDir, options.linkName)
  const binaryPath = path.join(sourceDir, builtBinaryRelativePath())

  if (options.dryRun) {
    if (options.configOnly) {
      process.stdout.write(`Would update ASK/PLAN config in ${configDir}\n`)
    } else {
      process.stdout.write(`Would clone/reset ${repo} @ ${ref} into ${sourceDir}\n`)
      process.stdout.write(`Would build ${binaryPath}\n`)
      process.stdout.write(`Would link ${linkPath} -> ${binaryPath}\n`)
      process.stdout.write(`Would update ASK/PLAN config in ${configDir}\n`)
    }
    return
  }

  const previousState = await readState(stateDir)
  const nextState = previousState ? { ...previousState } : {}

  if (!options.configOnly) {
    await ensureCleanSourceDir(sourceDir, repo, ref)
    await run("bun", ["install"], { cwd: sourceDir })
    await run("bun", ["run", "script/build.ts", "--single"], { cwd: path.join(sourceDir, manifest.packageDir) })

    if (!(await fileExists(binaryPath))) {
      throw new Error(`Built binary not found at ${binaryPath}`)
    }

    await fs.mkdir(binDir, { recursive: true })
    const backupPath = await prepareLink(linkPath, previousState)
    await fs.rm(linkPath, { force: true })
    await fs.symlink(binaryPath, linkPath)

    nextState.repo = repo
    nextState.ref = ref
    nextState.sourceDir = sourceDir
    nextState.binaryPath = binaryPath
    nextState.linkPath = linkPath
    nextState.backupPath = backupPath
  }

  nextState.config = await installManagedConfig(configDir, previousState?.config)
  nextState.installedAt = new Date().toISOString()

  if (!nextState.repo) nextState.repo = repo
  if (!nextState.ref) nextState.ref = ref
  if (!nextState.sourceDir) nextState.sourceDir = sourceDir

  await writeState(stateDir, nextState)
  printInstallSummary(nextState)
}

async function uninstall(options) {
  const defaults = defaultPaths()
  const stateDir = options.stateDir || defaults.stateDir
  const state = await readState(stateDir)

  if (!state) {
    if (!options.dryRun) {
      process.stdout.write("No install state found.\n")
    }
    return
  }

  if (options.dryRun) {
    if (state.linkPath) process.stdout.write(`Would remove ${state.linkPath}\n`)
    if (state.backupPath) process.stdout.write(`Would restore backup ${state.backupPath}\n`)
    if (state.config?.configPath) process.stdout.write(`Would restore ASK/PLAN config in ${state.config.configPath}\n`)
    if (options.purge && state.sourceDir) process.stdout.write(`Would purge ${state.sourceDir}\n`)
    return
  }

  if (state.linkPath) {
    await fs.rm(state.linkPath, { force: true })
    if (state.backupPath && (await fileExists(state.backupPath))) {
      await fs.rename(state.backupPath, state.linkPath)
    }
  }
  await uninstallManagedConfig(state.config)
  if (options.purge && state.sourceDir) {
    await fs.rm(state.sourceDir, { recursive: true, force: true })
  }
  await removeState(stateDir)
  process.stdout.write("Removed managed ASK/PLAN install.\n")
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
