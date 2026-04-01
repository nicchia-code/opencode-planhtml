import fs from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { builtBinaryRelativePath, defaultPaths, parseCliArgs } from "../src/opencode-planhtml/installer.mjs"

const manifestPath = fileURLToPath(new URL("../patches/opencode-planhtml/manifest.json", import.meta.url))
const patchPath = fileURLToPath(new URL("../patches/opencode-planhtml/opencode-planhtml.patch", import.meta.url))

describe("opencode plan HTML installer helpers", () => {
  it("computes stable default directories", () => {
    const paths = defaultPaths({ XDG_DATA_HOME: "/tmp/data", XDG_STATE_HOME: "/tmp/state" }, "/tmp/home")

    expect(paths.binDir).toBe("/tmp/home/.local/bin")
    expect(paths.sourceDir).toBe("/tmp/data/opencode-planhtml/source")
    expect(paths.stateDir).toBe("/tmp/state/opencode-planhtml")
  })

  it("computes the single-target binary path for the current platform shape", () => {
    expect(builtBinaryRelativePath("linux", "x64")).toBe("packages/opencode/dist/opencode-linux-x64/bin/opencode")
    expect(builtBinaryRelativePath("win32", "arm64")).toBe("packages/opencode/dist/opencode-windows-arm64/bin/opencode.exe")
  })

  it("parses install args with install as the default command", () => {
    const parsed = parseCliArgs(["--link-name", "opencode-dev", "--dry-run"])

    expect(parsed.command).toBe("install")
    expect(parsed.linkName).toBe("opencode-dev")
    expect(parsed.dryRun).toBe(true)
  })

  it("ignores a leading bun separator", () => {
    const parsed = parseCliArgs(["--", "--link-name", "opencode"])

    expect(parsed.command).toBe("install")
    expect(parsed.linkName).toBe("opencode")
  })

  it("parses explicit subcommands", () => {
    const parsed = parseCliArgs(["uninstall", "--purge", "--bin-dir", "/tmp/bin"])

    expect(parsed.command).toBe("uninstall")
    expect(parsed.purge).toBe(true)
    expect(parsed.binDir).toBe("/tmp/bin")
  })

  it("keeps manifest files in sync with the exported patch", async () => {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { files: string[] }
    const patch = await fs.readFile(patchPath, "utf8")
    const patchedFiles = Array.from(
      new Set(
        Array.from(patch.matchAll(/^diff --git a\/(.+?) b\//gm), (match) => match[1]),
      ),
    ).sort()

    expect(manifest.files.slice().sort()).toEqual(patchedFiles)
  })
})
