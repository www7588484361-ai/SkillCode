import { describe, expect, it } from "bun:test"
import { HermesToolParser } from "../../src/session/tool_parser"

describe("HermesToolParser", () => {
  it("extracts Hermes-standard XML tool calls", () => {
    const text = `I will read the configuration now.
<tool_call>
{"name": "read", "arguments": {"filePath": "package.json"}}
</tool_call>
Let me know if you need anything else.`

    const { calls, cleanedText } = HermesToolParser.extractToolCallsFromText(text)

    expect(calls.length).toBe(1)
    expect(calls[0].name).toBe("read")
    expect(calls[0].input).toEqual({ filePath: "package.json" })
    expect(cleanedText).toBe("I will read the configuration now.\n\nLet me know if you need anything else.")
  })

  it("extracts OpenAI-shaped function calls in XML", () => {
    const text = `<tool_call>
{"id": "call_abc123", "type": "function", "function": {"name": "edit", "arguments": "{\\"filePath\\":\\"src/app.ts\\",\\"oldContent\\":\\"a\\",\\"newContent\\":\\"b\\"}"}}
</tool_call>`

    const { calls, cleanedText } = HermesToolParser.extractToolCallsFromText(text)

    expect(calls.length).toBe(1)
    expect(calls[0].id).toBe("call_abc123")
    expect(calls[0].name).toBe("edit")
    expect(calls[0].input).toEqual({ filePath: "src/app.ts", oldContent: "a", newContent: "b" })
    expect(cleanedText).toBe("")
  })

  it("extracts Anthropic-style tag-based tool calls", () => {
    const text = `Executing search:
<tool_call>
<name>grep</name>
<arguments>{"query": "HermesReflection"}</arguments>
</tool_call>`

    const { calls, cleanedText } = HermesToolParser.extractToolCallsFromText(text)

    expect(calls.length).toBe(1)
    expect(calls[0].name).toBe("grep")
    expect(calls[0].input).toEqual({ query: "HermesReflection" })
    expect(cleanedText).toBe("Executing search:")
  })

  it("extracts <scratchpad> reasoning blocks without leaking into cleaned text", () => {
    const text = `<scratchpad>
We need to inspect the database schema before modifying models.
</scratchpad>
<tool_call>
{"name": "read", "arguments": {"filePath": "src/schema.ts"}}
</tool_call>`

    const { calls, cleanedText, reasonings } = HermesToolParser.extractToolCallsFromText(text)

    expect(reasonings.length).toBe(1)
    expect(reasonings[0]).toBe("We need to inspect the database schema before modifying models.")
    expect(calls.length).toBe(1)
    expect(calls[0].name).toBe("read")
    expect(cleanedText).toBe("")
  })

  it("handles bare top-level JSON tool calls as a fallback", () => {
    const text = `{"name": "os_execute", "arguments": {"command": "dir"}}`

    const { calls, cleanedText } = HermesToolParser.extractToolCallsFromText(text)

    expect(calls.length).toBe(1)
    expect(calls[0].name).toBe("os_execute")
    expect(calls[0].input).toEqual({ command: "dir" })
    expect(cleanedText).toBe("")
  })

  it("preserves regular conversational text when no tool calls are present", () => {
    const text = "Hello! I am ready to help you with your project."
    const { calls, cleanedText } = HermesToolParser.extractToolCallsFromText(text)

    expect(calls.length).toBe(0)
    expect(cleanedText).toBe(text)
  })
})
