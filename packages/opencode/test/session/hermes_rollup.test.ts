import { describe, expect, it } from "bun:test"
import { HermesMemoryRollup } from "../../src/session/rollup"
import { SessionV1 } from "@spacecode/core/v1/session"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

describe("HermesMemoryRollup", () => {
  it("builds a fresh structured roll-up prompt without prior summary", () => {
    const prompt = HermesMemoryRollup.buildHermesRollupPrompt({
      context: ["[User]: Build a REST API", "[Assistant action]: read(path: 'index.ts')"],
    })

    expect(prompt).toContain("## Goal")
    expect(prompt).toContain("## Constraints & Preferences")
    expect(prompt).toContain("## Completed Actions")
    expect(prompt).toContain("## Active State")
    expect(prompt).toContain("## Blocked & Unresolved Errors")
    expect(prompt).toContain("## Key Decisions")
    expect(prompt).toContain("## Errors & Fixes")
    expect(prompt).toContain("## Relevant Files")
    expect(prompt).toContain("## Critical Context")
    expect(prompt).toContain("<conversation>")
    expect(prompt).not.toContain("<prior-summary>")
  })

  it("builds an iterative roll-up prompt when prior summary exists", () => {
    const priorSummary = `## Goal\n- Build API\n\n## Completed Actions\n1. Initialized repository`
    const prompt = HermesMemoryRollup.buildHermesRollupPrompt({
      previousSummary: priorSummary,
      context: ["[Assistant action]: edit(path: 'server.ts')"],
      focusTopic: "Database connection",
    })

    expect(prompt).toContain("<prior-summary>")
    expect(prompt).toContain("Initialized repository")
    expect(prompt).toContain("You are updating a recursive context compaction summary")
    expect(prompt).toContain('FOCUS GUIDANCE: Prioritize retaining detailed state, paths, and diagnostics related to: "Database connection"')
  })

  it("serializes turns into compact engineering format", () => {
    const sessionID = SessionID.make("ses_test")
    const msgID = MessageID.ascending()
    const msgID2 = MessageID.ascending()

    const userMsg: SessionV1.WithParts = {
      info: {
        id: msgID,
        role: "user",
        sessionID,
        time: { created: Date.now() },
        model: { providerID: "test" as any, modelID: "test" as any },
        agent: "default",
      },
      parts: [
        {
          id: PartID.ascending(),
          messageID: msgID,
          sessionID,
          type: "text",
          text: "Fix the bug in auth.ts",
        },
      ],
    }

    const assistantMsg: SessionV1.WithParts = {
      info: {
        id: msgID2,
        role: "assistant",
        sessionID,
        parentID: msgID,
        time: { created: Date.now() },
        modelID: "test" as any,
        providerID: "test" as any,
        mode: "default",
        agent: "default",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        path: { cwd: "C:/project", root: "C:/project" },
      },
      parts: [
        {
          id: PartID.ascending(),
          messageID: msgID2,
          sessionID,
          type: "tool",
          tool: "edit",
          callID: "call_1",
          state: {
            status: "completed",
            input: { filePath: "auth.ts" },
            output: "Successfully updated auth.ts",
            time: { start: 100, end: 200 },
          },
        },
        {
          id: PartID.ascending(),
          messageID: msgID2,
          sessionID,
          type: "tool",
          tool: "bash",
          callID: "call_2",
          state: {
            status: "error",
            input: { command: "bun test" },
            error: "SyntaxError in auth.ts:15",
            time: { start: 200, end: 300 },
          },
        },
      ],
    }

    const userSerialized = HermesMemoryRollup.serializeTurnForRollup(userMsg)
    expect(userSerialized).toContain("[User]: Fix the bug in auth.ts")

    const assistantSerialized = HermesMemoryRollup.serializeTurnForRollup(assistantMsg)
    expect(assistantSerialized).toContain("[Assistant action]: edit({\"filePath\":\"auth.ts\"})")
    expect(assistantSerialized).toContain("[Outcome (edit)]: Successfully updated auth.ts")
    expect(assistantSerialized).toContain("[Assistant action]: bash({\"command\":\"bun test\"})")
    expect(assistantSerialized).toContain("[Failure (bash)]: SyntaxError in auth.ts:15")
  })
})
