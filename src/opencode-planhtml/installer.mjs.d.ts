export type InstallerPaths = {
  binDir: string
  sourceDir: string
  stateDir: string
}

export type InstallerCliOptions = {
  command: string
  dryRun: boolean
  purge: boolean
  linkName: string
  repo: string
  ref: string
  sourceDir: string
  binDir: string
  stateDir: string
}

export function defaultPaths(env?: NodeJS.ProcessEnv, home?: string): InstallerPaths
export function builtBinaryRelativePath(platform?: string, arch?: string): string
export function parseCliArgs(argv: string[]): InstallerCliOptions
export function main(argv?: string[]): Promise<void>
