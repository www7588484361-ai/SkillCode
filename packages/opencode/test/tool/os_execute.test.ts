import { describe, expect } from "bun:test"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "@/tool/truncate"
import { Config } from "@/config/config"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"
import { Tool } from "@/tool/tool"
import { OsExecuteTool } from "../../src/tool/os_execute"
import { provideInstance, testInstanceStoreLayer } from "../fixture/fixture"

const testLayer = Layer.mergeAll(
  LayerNode.compile(
    LayerNode.group([
      Truncate.node,
      Config.node,
      Agent.node,
    ]),
  ),
  testInstanceStoreLayer,
)

const it = testEffect(testLayer)

function makeCtx(): Tool.Context {
  return {
    sessionID: SessionID.descending(),
    messageID: MessageID.ascending(),
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata() {
      return Effect.void
    },
    ask() {
      return Effect.void
    },
  }
}

describe("OsExecuteTool", () => {
  it.effect("executes powershell commands directly on the host OS", () =>
    Effect.gen(function* () {
      const info = yield* OsExecuteTool
      const def = yield* Tool.init(info)
      const ctx = makeCtx()

      const result = yield* def.execute(
        {
          command: "Write-Output 'spacecode-powershell-test'",
          shell: "powershell",
        },
        ctx,
      )

      expect(result.metadata.exitCode).toBe(0)
      expect(result.metadata.stdout).toContain("spacecode-powershell-test")
      expect(typeof result.metadata.executionTimeMs).toBe("number")
      const parsed = JSON.parse(result.output)
      expect(parsed.exitCode).toBe(0)
      expect(parsed.stdout).toContain("spacecode-powershell-test")
    }).pipe(provideInstance(process.cwd())),
  )

  it.effect("executes cmd commands directly on the host OS", () =>
    Effect.gen(function* () {
      const info = yield* OsExecuteTool
      const def = yield* Tool.init(info)
      const ctx = makeCtx()

      const result = yield* def.execute(
        {
          command: "echo spacecode-cmd-test",
          shell: "cmd",
        },
        ctx,
      )

      expect(result.metadata.exitCode).toBe(0)
      expect(result.metadata.stdout).toContain("spacecode-cmd-test")
      expect(typeof result.metadata.executionTimeMs).toBe("number")
    }).pipe(provideInstance(process.cwd())),
  )

  it.effect("handles cwd and environment properly without path restriction", () =>
    Effect.gen(function* () {
      const info = yield* OsExecuteTool
      const def = yield* Tool.init(info)
      const ctx = makeCtx()

      const result = yield* def.execute(
        {
          command: "Get-Location | Select-Object -ExpandProperty Path",
          shell: "powershell",
          cwd: "C:\\Windows",
        },
        ctx,
      )

      expect(result.metadata.exitCode).toBe(0)
      expect(result.metadata.stdout.trim()).toBe("C:\\Windows")
    }).pipe(provideInstance(process.cwd())),
  )

  it.effect("rejects python import antigravity", () =>
    Effect.gen(function* () {
      const info = yield* OsExecuteTool
      const def = yield* Tool.init(info)
      const ctx = makeCtx()

      const res1 = yield* def.execute(
        {
          command: 'python -c "import antigravity"',
          shell: "powershell",
        },
        ctx,
      )

      expect(res1.metadata.rejected).toBe(true)
      expect(res1.output).toContain("'antigravity' is a desktop application on Windows")
    }).pipe(provideInstance(process.cwd())),
  )
})
