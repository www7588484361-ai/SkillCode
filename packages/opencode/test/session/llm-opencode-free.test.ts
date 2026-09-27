import { describe, expect, test } from "bun:test"
import { LLMRequestPrep } from "@/session/llm/request"
import { Effect, Layer } from "effect"
import { jsonSchema } from "ai"
import { InstanceRef } from "@/effect/instance-ref"

describe("opencode provider free tier compatibility", () => {
  const instanceLayer = Layer.succeed(InstanceRef, {
    project: { id: "test-project" },
    directory: process.cwd(),
  } as any)

  test("sends opencode User-Agent and session headers for opencode provider", async () => {
    const sessionID = "ses_f410c4e7affeVtnKehcuYJqVW3"
    const model = {
      id: "jev-1.13-free",
      providerID: "opencode",
      capabilities: {},
      options: {},
      limit: { output: 4096 },
      api: { id: "jev-1.13-free", npm: "@ai-sdk/openai-compatible" },
    } as any

    const result = await Effect.runPromise(
      LLMRequestPrep.prepare({
        user: {
          id: "msg_user-test",
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: "test",
          model: { providerID: "opencode", modelID: "jev-1.13-free" },
        } as any,
        sessionID,
        model,
        agent: {
          name: "test",
          mode: "primary",
          options: {},
          permission: [],
        } as any,
        system: [],
        messages: [{ role: "user", content: "Hello" }],
        tools: {
          bash: {
            description: "Run command",
            inputSchema: jsonSchema({ type: "object", properties: {} }),
          },
        } as any,
        provider: { id: "opencode", options: {} } as any,
        auth: undefined,
        plugin: {
          trigger: (_name: string, _input: unknown, output: unknown) => Effect.succeed(output),
          list: () => Effect.succeed([]),
          init: () => Effect.void,
        } as any,
        flags: { client: "cli" } as any,
        isWorkflow: false,
      }).pipe(Effect.provide(instanceLayer)),
    )

    expect(result.headers["User-Agent"]).toContain("opencode/1.18.31")
    expect(result.headers["x-opencode-client"]).toBe("cli")
    expect(result.headers["x-opencode-session"]).toBe(sessionID)
    expect(result.headers["x-opencode-request"]).toBe("msg_user-test")
    expect(result.headers["x-opencode-project"]).toBe("test-project")
  })

  test("enforces global location and region headers for opencode-go and DeepSeek models", async () => {
    const sessionID = "ses_f410c4e7affeVtnKehcuYJqVW3"
    const model = {
      id: "deepseek-v4-flash",
      providerID: "opencode-go",
      capabilities: {},
      options: {},
      limit: { output: 4096 },
      api: { id: "deepseek-v4-flash", npm: "@ai-sdk/openai-compatible" },
    } as any

    const result = await Effect.runPromise(
      LLMRequestPrep.prepare({
        user: {
          id: "msg_user-test",
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: "test",
          model: { providerID: "opencode-go", modelID: "deepseek-v4-flash" },
        } as any,
        sessionID,
        model,
        agent: {
          name: "test",
          mode: "primary",
          options: {},
          permission: [],
        } as any,
        system: [],
        messages: [{ role: "user", content: "Hello" }],
        tools: {},
        provider: { id: "opencode-go", options: {} } as any,
        auth: undefined,
        plugin: {
          trigger: (_name: string, _input: unknown, output: unknown) => Effect.succeed(output),
          list: () => Effect.succeed([]),
          init: () => Effect.void,
        } as any,
        flags: { client: "cli" } as any,
        isWorkflow: false,
      }).pipe(Effect.provide(instanceLayer)),
    )

    expect(result.headers["x-opencode-location"]).toBe("global")
    expect(result.headers["x-opencode-region"]).toBe("global")
    expect(result.headers["location"]).toBe("global")
    expect(result.headers["x-opencode-project"]).toBe("global")
  })

  test("supplies fallback standard tools when agent has no tools for opencode provider", async () => {
    const sessionID = "ses_f410c4e7affeVtnKehcuYJqVW3"
    const model = {
      id: "jev-1.13-free",
      providerID: "opencode",
      capabilities: {},
      options: {},
      limit: { output: 4096 },
      api: { id: "jev-1.13-free", npm: "@ai-sdk/openai-compatible" },
    } as any

    const result = await Effect.runPromise(
      LLMRequestPrep.prepare({
        user: {
          id: "msg_user-test",
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: "title",
          model: { providerID: "opencode", modelID: "jev-1.13-free" },
        } as any,
        sessionID,
        model,
        agent: {
          name: "title",
          mode: "primary",
          options: {},
          permission: [{ permission: "*", pattern: "*", action: "deny" }], // all tools denied for title agent
        } as any,
        system: [],
        messages: [{ role: "user", content: "Hello" }],
        tools: {
          bash: {
            description: "Run command",
            inputSchema: jsonSchema({ type: "object", properties: {} }),
          },
          read: {
            description: "Read file",
            inputSchema: jsonSchema({ type: "object", properties: {} }),
          },
        } as any,
        provider: { id: "opencode", options: {} } as any,
        auth: undefined,
        plugin: {
          trigger: (_name: string, _input: unknown, output: unknown) => Effect.succeed(output),
          list: () => Effect.succeed([]),
          init: () => Effect.void,
        } as any,
        flags: { client: "cli" } as any,
        isWorkflow: false,
      }).pipe(Effect.provide(instanceLayer)),
    )

    // Verify tools are preserved so upstream free-tier gateway check passes
    expect(Object.keys(result.tools).length).toBeGreaterThan(0)
    expect(result.tools["bash"]).toBeDefined()
    expect(result.tools["read"]).toBeDefined()
  })
})
