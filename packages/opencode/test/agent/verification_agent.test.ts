import { afterEach, expect, describe } from "bun:test"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import { Effect } from "effect"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Permission } from "../../src/permission"
import { PermissionV1 } from "@spacecode/core/v1/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const it = testEffect(agentLayer())

function evalPerm(agent: Agent.Info | undefined, permission: string): PermissionV1.Action | undefined {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

function load<A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Agent.Service.use(fn)
}

afterEach(async () => {
  await disposeAllInstances()
})

describe("agent.verification", () => {
  it.instance("verification agent is registered as native subagent", () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.get("verification"))
      expect(agent).toBeDefined()
      expect(agent.name).toBe("verification")
      expect(agent.mode).toBe("subagent")
      expect(agent.native).toBe(true)
      expect(agent.description).toContain("Adversarial verification agent")
    }),
  )

  it.instance("verification agent enforces read-only project restrictions", () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.get("verification"))
      expect(agent).toBeDefined()

      // Edit and write tools must be denied
      expect(evalPerm(agent, "edit")).toBe("deny")
      expect(evalPerm(agent, "write")).toBe("deny")

      // Inspection and execution tools must be allowed
      expect(evalPerm(agent, "read")).toBe("allow")
      expect(evalPerm(agent, "grep")).toBe("allow")
      expect(evalPerm(agent, "glob")).toBe("allow")
      expect(evalPerm(agent, "list")).toBe("allow")
      expect(evalPerm(agent, "bash")).toBe("allow")
      expect(evalPerm(agent, "os_execute")).toBe("allow")
    }),
  )

  it.instance("verification agent has adversarial anti-avoidance prompt loaded", () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.get("verification"))
      expect(agent).toBeDefined()
      expect(agent.prompt).toBeDefined()
      expect(agent.prompt).toContain("You are a verification specialist")
      expect(agent.prompt).toContain("VERDICT: PASS")
      expect(agent.prompt).toContain("VERDICT: FAIL")
      expect(agent.prompt).toContain("CRITICAL: DO NOT MODIFY THE PROJECT")
    }),
  )
})
