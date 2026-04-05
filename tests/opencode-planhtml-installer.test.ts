import {
  applyManagedAgentConfig,
  builtBinaryRelativePath,
  defaultPaths,
  managedAskAgentConfig,
  parseCliArgs,
  restoreManagedAgentConfig,
} from "../src/opencode-planhtml/installer.mjs"
import { describe, expect, it } from "vitest"

describe("opencode plan agents installer helpers", () => {
  it("computes stable default directories", () => {
    const paths = defaultPaths(
      {
        XDG_DATA_HOME: "/tmp/data",
        XDG_STATE_HOME: "/tmp/state",
        XDG_CONFIG_HOME: "/tmp/config",
      },
      "/tmp/home",
    )

    expect(paths.binDir).toBe("/tmp/home/.local/bin")
    expect(paths.sourceDir).toBe("/tmp/data/opencode-plan-agents/source")
    expect(paths.stateDir).toBe("/tmp/state/opencode-plan-agents")
    expect(paths.configDir).toBe("/tmp/config/opencode")
  })

  it("computes the single-target binary path for the current platform shape", () => {
    expect(builtBinaryRelativePath("linux", "x64")).toBe("packages/opencode/dist/opencode-linux-x64/bin/opencode")
    expect(builtBinaryRelativePath("win32", "arm64")).toBe("packages/opencode/dist/opencode-windows-arm64/bin/opencode.exe")
  })

  it("parses install args with install as the default command", () => {
    const parsed = parseCliArgs(["--link-name", "opencode-dev", "--config-only", "--dry-run"])

    expect(parsed.command).toBe("install")
    expect(parsed.linkName).toBe("opencode-dev")
    expect(parsed.configOnly).toBe(true)
    expect(parsed.dryRun).toBe(true)
  })

  it("ignores a leading bun separator", () => {
    const parsed = parseCliArgs(["--", "--link-name", "opencode"])

    expect(parsed.command).toBe("install")
    expect(parsed.linkName).toBe("opencode")
  })

  it("parses explicit subcommands", () => {
    const parsed = parseCliArgs(["uninstall", "--purge", "--state-dir", "/tmp/state"])

    expect(parsed.command).toBe("uninstall")
    expect(parsed.purge).toBe(true)
    expect(parsed.stateDir).toBe("/tmp/state")
  })

  it("installs managed ASK and PLAN config while preserving unrelated values", () => {
    const next = applyManagedAgentConfig({
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        plan: {
          model: "anthropic/claude-haiku-4-20250514",
        },
        build: {
          color: "primary",
        },
      },
    })

    expect(next.$schema).toBe("https://opencode.ai/config.json")
    expect(next.agent.build).toEqual({ color: "primary" })
    expect(next.agent.plan).toEqual({
      model: "anthropic/claude-haiku-4-20250514",
      prompt: "{file:./prompts/opencode-plan-agents/plan.txt}",
    })
    expect(next.agent.ask).toEqual(managedAskAgentConfig())
  })

  it("restores previous plan and ask config on uninstall", () => {
    const restored = restoreManagedAgentConfig(
      applyManagedAgentConfig({
        agent: {
          plan: { model: "before" },
          ask: { model: "custom-before" },
        },
      }),
      {
        configExistedBefore: true,
        previousPlanAgent: { model: "before" },
        previousAskAgent: { model: "custom-before" },
      },
    )

    expect(restored).toEqual({
      $schema: "https://opencode.ai/config.json",
      agent: {
        plan: { model: "before" },
        ask: { model: "custom-before" },
      },
    })
  })

  it("removes the config file entirely when the installer created it", () => {
    const restored = restoreManagedAgentConfig(
      applyManagedAgentConfig({}),
      {
        configExistedBefore: false,
        previousPlanAgent: undefined,
        previousAskAgent: undefined,
      },
    )

    expect(restored).toBeUndefined()
  })
})
