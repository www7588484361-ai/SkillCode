import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { UpdatePlanTool } from "../../src/tool/update_plan"
import { Todo } from "../../src/session/todo"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

import { LayerNode } from "@spacecode/core/effect/layer-node"
import { CrossSpawnSpawner } from "@spacecode/core/cross-spawn-spawner"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { Ripgrep } from "@spacecode/core/ripgrep"
import { FSUtil } from "@spacecode/core/fs-util"
import { Git } from "@/git"

const toolLayer = () =>
  LayerNode.compile(
    LayerNode.group([CrossSpawnSpawner.node, FSUtil.node, Ripgrep.node, Truncate.node, Agent.node, Git.node]),
  )

const mockTodoLayer = Layer.succeed(Todo.Service, {
  update: () => Effect.void,
  get: () => Effect.succeed([]),
})

const it = testEffect(Layer.mergeAll(toolLayer(), mockTodoLayer))

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

describe("Structured Plan & Multi-File Engine (Codex update_plan)", () => {
  it.instance("formats plan progress with checkboxes and indicators", () =>
    Effect.gen(function* () {
      const toolDef = yield* UpdatePlanTool
      const updatePlan = yield* toolDef.init()

      const result = yield* updatePlan.execute(
        {
          explanation: "Refactoring authentication modules across files",
          plan: [
            { step: "Update User interface in types.ts", status: "completed" },
            { step: "Update auth service token validator in auth.ts", status: "in_progress" },
            { step: "Add unit tests in auth.test.ts", status: "pending" },
          ],
        },
        ctx,
      )

      expect(result.metadata.completed).toBe(1)
      expect(result.metadata.inProgress).toBe(1)
      expect(result.metadata.pending).toBe(1)

      expect(result.output).toContain("Plan update: Refactoring authentication modules across files")
      expect(result.output).toContain("Progress: 1/3 completed (1 in progress)")
      expect(result.output).toContain("[x] Update User interface in types.ts")
      expect(result.output).toContain("[>] Update auth service token validator in auth.ts")
      expect(result.output).toContain("[ ] Add unit tests in auth.test.ts")
    }),
  )
})
