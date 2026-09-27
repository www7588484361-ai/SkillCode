import { describe, expect } from "bun:test"
import path from "path"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import { Effect } from "effect"
import { SymbolSliceTool } from "../../src/tool/symbol_slice"
import { TestInstance } from "../fixture/fixture"
import { SessionID, MessageID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@spacecode/core/cross-spawn-spawner"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { Ripgrep } from "@spacecode/core/ripgrep"
import { FSUtil } from "@spacecode/core/fs-util"
import { testEffect } from "../lib/effect"
import { Git } from "@/git"

const toolLayer = () =>
  LayerNode.compile(
    LayerNode.group([CrossSpawnSpawner.node, FSUtil.node, Ripgrep.node, Truncate.node, Agent.node, Git.node]),
  )

const it = testEffect(toolLayer())

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

describe("tool.symbol_slice", () => {
  it.instance("extracts dependency symbols and interfaces for target file", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance

      // 1. Create a dependency file
      const modelFile = path.join(test.directory, "model.ts")
      yield* Effect.promise(() =>
        Bun.write(
          modelFile,
          `export interface AccountProfile {
  id: string
  username: string
  role: "admin" | "user"
}

export function createAccount(username: string): AccountProfile {
  return { id: "1", username, role: "user" }
}

const SECRET_INTERNAL = "dont_leak"
`,
        ),
      )

      // 2. Create the target file that imports from the dependency
      const serviceFile = path.join(test.directory, "service.ts")
      yield* Effect.promise(() =>
        Bun.write(
          serviceFile,
          `import { AccountProfile, createAccount } from "./model"

export function getProfile(): AccountProfile {
  return createAccount("sahil")
}
`,
        ),
      )

      const info = yield* SymbolSliceTool
      const tool = yield* info.init()
      const result = yield* tool.execute(
        {
          file_path: serviceFile,
        },
        ctx,
      )

      expect(result.metadata.totalDependencies).toBe(1)
      expect(result.metadata.totalSymbols).toBe(2)
      expect(result.output).toContain("Dependency Symbol Slice")
      expect(result.output).toContain("export interface AccountProfile")
      expect(result.output).toContain("export function createAccount")
      expect(result.output).not.toContain("SECRET_INTERNAL")
    }),
  )
})
