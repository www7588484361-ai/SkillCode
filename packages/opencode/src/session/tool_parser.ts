export namespace HermesToolParser {
  export interface ParsedToolCall {
    id: string
    name: string
    input: Record<string, unknown>
    raw: string
  }

  export interface ParseResult {
    calls: ParsedToolCall[]
    cleanedText: string
    reasonings: string[]
  }

  const TOOL_CALL_BLOCK_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi
  const FUNCTION_CALL_BLOCK_RE = /<function_call>\s*([\s\S]*?)\s*<\/function_call>/gi
  const REASONING_BLOCK_RE = /<(?:REASONING_SCRATCHPAD|scratchpad|thought|thinking)>([\s\S]*?)<\/(?:REASONING_SCRATCHPAD|scratchpad|thought|thinking)>/gi

  /**
   * Helper to parse JSON safely, supporting single-quoted strings or relaxed formatting if needed.
   */
  function tryParseJson(text: string): any {
    const trimmed = text.trim()
    try {
      return JSON.parse(trimmed)
    } catch {
      // Try stripping markdown fences ```json ... ```
      const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
      if (fenceMatch && fenceMatch[1]) {
        try {
          return JSON.parse(fenceMatch[1].trim())
        } catch {
          // ignore
        }
      }
      return null
    }
  }

  /**
   * Parses an individual tool call block body into a ParsedToolCall object.
   */
  export function parseToolCallBlock(blockContent: string, ordinal: number): ParsedToolCall | null {
    const trimmed = blockContent.trim()
    if (!trimmed) return null

    // 1. Try direct JSON parsing
    const obj = tryParseJson(trimmed)
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      // 1A. Hermes standard format: {"name": string, "arguments": object|string}
      if (typeof obj.name === "string" && obj.name.trim()) {
        const name = obj.name.trim()
        let input: Record<string, unknown> = {}
        if (obj.arguments && typeof obj.arguments === "object" && !Array.isArray(obj.arguments)) {
          input = obj.arguments
        } else if (typeof obj.arguments === "string") {
          try {
            input = JSON.parse(obj.arguments)
          } catch {
            input = { value: obj.arguments }
          }
        } else if (obj.parameters && typeof obj.parameters === "object") {
          input = obj.parameters
        } else if (obj.input && typeof obj.input === "object") {
          input = obj.input
        }
        return {
          id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : `hermes_call_${ordinal}`,
          name,
          input,
          raw: trimmed,
        }
      }

      // 1B. OpenAI format: {"id": "...", "type": "function", "function": {"name": "...", "arguments": ...}}
      if (obj.function && typeof obj.function === "object" && typeof obj.function.name === "string") {
        const name = obj.function.name.trim()
        let input: Record<string, unknown> = {}
        const rawArgs = obj.function.arguments
        if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
          input = rawArgs
        } else if (typeof rawArgs === "string") {
          try {
            input = JSON.parse(rawArgs)
          } catch {
            input = { value: rawArgs }
          }
        }
        return {
          id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : `hermes_call_${ordinal}`,
          name,
          input,
          raw: trimmed,
        }
      }

      // 1C. Tool / input shape: {"tool": "...", "input": {...}}
      if (typeof obj.tool === "string" && obj.tool.trim()) {
        const name = obj.tool.trim()
        const input = (obj.input && typeof obj.input === "object" && !Array.isArray(obj.input))
          ? obj.input
          : {}
        return {
          id: typeof obj.id === "string" && obj.id.trim() ? obj.id.trim() : `hermes_call_${ordinal}`,
          name,
          input,
          raw: trimmed,
        }
      }
    }

    // 2. Try XML tag extraction inside block (Anthropic style):
    // <name>read_file</name><arguments>...</arguments>
    const nameMatch = trimmed.match(/<(?:name|tool_name)>([\s\S]*?)<\/(?:name|tool_name)>/i)
    if (nameMatch && nameMatch[1]) {
      const name = nameMatch[1].trim()
      let input: Record<string, unknown> = {}
      const argsMatch = trimmed.match(/<(?:arguments|parameters|input)>([\s\S]*?)<\/(?:arguments|parameters|input)>/i)
      if (argsMatch && argsMatch[1]) {
        const rawArgs = argsMatch[1].trim()
        try {
          input = JSON.parse(rawArgs)
        } catch {
          input = { value: rawArgs }
        }
      }
      return {
        id: `hermes_call_${ordinal}`,
        name,
        input,
        raw: trimmed,
      }
    }

    return null
  }

  /**
   * Inspects assistant text for embedded XML tool calls (<tool_call> or <function_call>)
   * and reasoning scratchpads (<scratchpad>, <REASONING_SCRATCHPAD>).
   *
   * Consumes and parses valid tool calls, removes the XML scaffolding from the text,
   * and returns cleaned conversational text alongside extracted tool calls.
   */
  export function extractToolCallsFromText(text: string): ParseResult {
    if (!text || typeof text !== "string") {
      return { calls: [], cleanedText: "", reasonings: [] }
    }

    const calls: ParsedToolCall[] = []
    const reasonings: string[] = []
    const spansToRemove: Array<{ start: number; end: number }> = []

    // 1. Extract reasoning scratchpads
    let scratchpadMatch: RegExpExecArray | null
    REASONING_BLOCK_RE.lastIndex = 0
    while ((scratchpadMatch = REASONING_BLOCK_RE.exec(text)) !== null) {
      if (scratchpadMatch[1]) {
        reasonings.push(scratchpadMatch[1].trim())
      }
      spansToRemove.push({ start: scratchpadMatch.index, end: scratchpadMatch.index + scratchpadMatch[0].length })
    }

    // 2. Extract <tool_call> blocks
    let toolCallMatch: RegExpExecArray | null
    TOOL_CALL_BLOCK_RE.lastIndex = 0
    while ((toolCallMatch = TOOL_CALL_BLOCK_RE.exec(text)) !== null) {
      const parsed = parseToolCallBlock(toolCallMatch[1], calls.length + 1)
      if (parsed) {
        calls.push(parsed)
      }
      spansToRemove.push({ start: toolCallMatch.index, end: toolCallMatch.index + toolCallMatch[0].length })
    }

    // 3. Extract <function_call> blocks if any
    let functionCallMatch: RegExpExecArray | null
    FUNCTION_CALL_BLOCK_RE.lastIndex = 0
    while ((functionCallMatch = FUNCTION_CALL_BLOCK_RE.exec(text)) !== null) {
      const parsed = parseToolCallBlock(functionCallMatch[1], calls.length + 1)
      if (parsed) {
        calls.push(parsed)
      }
      spansToRemove.push({ start: functionCallMatch.index, end: functionCallMatch.index + functionCallMatch[0].length })
    }

    // 4. If no XML tags matched, check for bare JSON tool invocation fallback (model dumped pure JSON)
    if (calls.length === 0) {
      const trimmed = text.trim()
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        const parsed = parseToolCallBlock(trimmed, 1)
        if (parsed) {
          return {
            calls: [parsed],
            cleanedText: "",
            reasonings,
          }
        }
      }
    }

    // 5. Clean text by removing consumed spans
    if (spansToRemove.length === 0) {
      return { calls, cleanedText: text.trim(), reasonings }
    }

    spansToRemove.sort((a, b) => a.start - b.start)
    let cleaned = ""
    let cursor = 0
    for (const span of spansToRemove) {
      if (cursor < span.start) {
        cleaned += text.slice(cursor, span.start)
      }
      cursor = Math.max(cursor, span.end)
    }
    if (cursor < text.length) {
      cleaned += text.slice(cursor)
    }

    return {
      calls,
      cleanedText: cleaned.trim(),
      reasonings,
    }
  }
}
