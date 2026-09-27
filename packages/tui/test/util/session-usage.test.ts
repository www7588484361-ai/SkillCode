import { describe, expect, test } from "bun:test"
import { sessionUsage, type UsageMessage } from "../../src/util/session-usage"

const tokens = (input: number, output: number) => ({
  input,
  output,
  reasoning: 0,
  cache: { read: 0, write: 0 },
})

const assistant = (sessionID: string, input: number, output: number): UsageMessage => ({
  role: "assistant",
  sessionID,
  providerID: "openrouter",
  modelID: "test-model",
  tokens: tokens(input, output),
})

const user = (sessionID: string): UsageMessage => ({
  role: "user",
  sessionID,
})

const findModel = () => ({ limit: { context: 100000 } })

describe("sessionUsage", () => {
  test("returns baseline for empty history (fresh /new thread)", () => {
    expect(sessionUsage("ses_a", [], findModel)).toEqual({ tokens: 0, percent: null })
  })

  test("ignores messages from other sessions", () => {
    const messages = [assistant("ses_other", 90000, 5000), user("ses_other")]
    expect(sessionUsage("ses_a", messages, findModel)).toEqual({ tokens: 0, percent: null })
  })

  test("uses the last completed turn of the active session only", () => {
    const messages = [
      assistant("ses_other", 99000, 9000),
      assistant("ses_a", 1000, 100),
      assistant("ses_a", 4000, 400),
    ]
    // 4000 + 400 = 4400 of 100000 -> 4%
    expect(sessionUsage("ses_a", messages, findModel)).toEqual({ tokens: 4400, percent: 4 })
  })

  test("holds the previous turn while a new turn streams (zero output)", () => {
    const streaming: UsageMessage = {
      role: "assistant",
      sessionID: "ses_a",
      providerID: "openrouter",
      modelID: "test-model",
      tokens: tokens(4400, 0),
    }
    const messages = [assistant("ses_a", 4000, 400), streaming]
    expect(sessionUsage("ses_a", messages, findModel)).toEqual({ tokens: 4400, percent: 4 })
  })

  test("returns null percent when the turn model is unknown", () => {
    const messages = [assistant("ses_a", 4000, 400)]
    expect(sessionUsage("ses_a", messages, () => undefined)).toEqual({ tokens: 4400, percent: null })
  })

  test("skips user messages lacking token payloads without throwing", () => {
    const messages = [user("ses_a"), assistant("ses_a", 2000, 200)]
    expect(sessionUsage("ses_a", messages, findModel)).toEqual({ tokens: 2200, percent: 2 })
  })

  test("empty session id never matches", () => {
    const messages = [assistant("ses_a", 2000, 200)]
    expect(sessionUsage("", messages, findModel)).toEqual({ tokens: 0, percent: null })
  })
})
