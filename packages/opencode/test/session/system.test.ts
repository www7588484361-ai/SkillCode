import { describe, expect, test } from "bun:test"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import { Effect, Layer } from "effect"
import type { Agent } from "../../src/agent/agent"
import { NamedError } from "@spacecode/core/util/error"
import { Skill } from "../../src/skill"
import { Permission } from "../../src/permission"
import type { Provider } from "../../src/provider/provider"
import { SystemPrompt } from "../../src/session/system"
import { MCP } from "../../src/mcp"
import { testEffect } from "../lib/effect"
import { provideInstance, testInstanceStoreLayer } from "../fixture/fixture"

const skills: Skill.Info[] = [
  {
    name: "zeta-skill",
    description: "Zeta skill.",
    location: "/tmp/zeta-skill/SKILL.md",
    content: "# zeta-skill",
  },
  {
    name: "alpha-skill",
    description: "Alpha skill.",
    location: "/tmp/alpha-skill/SKILL.md",
    content: "# alpha-skill",
  },
  {
    name: "middle-skill",
    description: "Middle skill.",
    location: "/tmp/middle-skill/SKILL.md",
    content: "# middle-skill",
  },
  {
    name: "manual-skill",
    location: "/tmp/manual-skill/SKILL.md",
    content: "# manual-skill",
  },
]

const build: Agent.Info = {
  name: "build",
  mode: "primary",
  permission: Permission.fromConfig({ "*": "allow" }),
  options: {},
}

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(SystemPrompt.node, [
      [
        MCP.node,
        Layer.mock(MCP.Service, {
          instructions: () =>
            Effect.succeed([
              {
                name: "guide-server",
                instructions: "Use lookup before mutate.",
                tools: [],
              },
              {
                name: "tool-server",
                instructions: "Prefer search before update.",
                tools: ["tool-server_search", "tool-server_update"],
              },
            ]),
        }),
      ],
      [
        Skill.node,
        Layer.succeed(
          Skill.Service,
          Skill.Service.of({
            get: (name) => Effect.succeed(skills.find((skill) => skill.name === name)),
            require: (name) => {
              const info = skills.find((skill) => skill.name === name)
              if (info) return Effect.succeed(info)
              return Effect.fail(new Skill.NotFoundError({ name, available: skills.map((skill) => skill.name) }))
            },
            all: () => Effect.succeed(skills),
            dirs: () => Effect.succeed([]),
            available: () => Effect.succeed(skills),
          }),
        ),
      ],
    ]),
    testInstanceStoreLayer,
  ),
)

describe("session.system", () => {
  test("selects the Meta prompt for Muse Spark model IDs", () => {
    for (const id of ["meta/muse-spark-preview", "muse-spark-1.1", "muse-spark-1.2"]) {
      const prompt = SystemPrompt.provider({ api: { id } } as Provider.Model)[0]
      expect(prompt).toContain("powered by Muse Spark,")
      expect(prompt).toContain("using Meta Muse Spark.")
      expect(prompt).not.toContain("{{MODEL_NAME}}")
    }
  })

  test("selects the Meta prompt for Muse Glimmer model IDs", () => {
    for (const id of ["meta/muse-glimmer", "meta/muse-glimmer-30b", "muse-glimmer-30b"]) {
      const prompt = SystemPrompt.provider({ api: { id } } as Provider.Model)[0]
      expect(prompt).toContain("powered by Muse Glimmer,")
      expect(prompt).toContain("using Meta Muse Glimmer.")
      expect(prompt).not.toContain("{{MODEL_NAME}}")
    }
  })

  test("selects the Kimi prompt for official provider model IDs", () => {
    for (const providerID of ["kimi-for-coding", "moonshotai", "moonshotai-cn"]) {
      const prompt = SystemPrompt.provider({ providerID, api: { id: "k3" } } as Provider.Model)[0]
      expect(prompt).toContain("# Prompt and Tool Use")
    }
  })

  it.effect("skills output is sorted by name and stable across calls", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const first = yield* prompt.skills(build)
      const second = yield* prompt.skills(build)
      const output = first ?? (yield* Effect.fail(new NamedError.Unknown({ message: "missing skills output" })))

      expect(first).toBe(second)

      const alpha = output.indexOf("<name>alpha-skill</name>")
      const middle = output.indexOf("<name>middle-skill</name>")
      const zeta = output.indexOf("<name>zeta-skill</name>")

      expect(alpha).toBeGreaterThan(-1)
      expect(middle).toBeGreaterThan(alpha)
      expect(zeta).toBeGreaterThan(middle)
      expect(output).not.toContain("manual-skill")
    }),
  )

  it.effect("MCP output includes connected server instructions", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build)

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          '  <server name="tool-server">',
          "    Prefer search before update.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("MCP output omits servers when all advertised tools are denied", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.mcp(build, Permission.fromConfig({ "tool-server_*": "deny" }))

      expect(output).toBe(
        [
          "<mcp_instructions>",
          '  <server name="guide-server">',
          "    Use lookup before mutate.",
          "  </server>",
          "</mcp_instructions>",
        ].join("\n"),
      )
    }),
  )

  it.effect("environment prompt includes Windows media playback and browser launch rules", () =>
    Effect.gen(function* () {
      const prompt = yield* SystemPrompt.Service
      const output = yield* prompt.environment({ api: { id: "gpt-4o" }, providerID: "openai" } as Provider.Model)
      const text = output.join("\n")

      expect(text).toContain("USER-FACING MEDIA PLAYBACK & DEFAULT BROWSER LAUNCH RULE")
      expect(text).toContain('cmd.exe /c start "" "<url>"')
      expect(text).toContain("yt-dlp")
      expect(text).toContain("WEB SEARCH VS PLAYBACK DISTINCTION")
      expect(text).toContain("FULL COMPLETION OF USER INTENT & ZERO HALF-MEASURES")
      expect(text).toContain("FAST 1-STEP RESOLUTION FOR MEDIA PLAYBACK")
      expect(text).toContain("FORBID DUMMY CALLS & SANITY PINGS")
      expect(text).toContain("https://www.youtube.com/watch?v=<videoId>")
      expect(text).toContain("FAST NATIVE WEB SEARCH (`web_search`)")
      expect(text).toContain("REFERENCE-DRIVEN ENGINEERING & SEARCH-BEFORE-CODING PROTOCOL")
      expect(text).toContain("AUTONOMOUS VERIFICATION BEFORE IMPLEMENTATION")
    }).pipe(provideInstance(process.cwd())),
  )
})


