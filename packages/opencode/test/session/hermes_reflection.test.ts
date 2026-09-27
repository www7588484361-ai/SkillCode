import { describe, expect, it } from "bun:test"
import { HermesReflection } from "../../src/session/reflection"
import { PermissionV1 } from "@spacecode/core/v1/permission"
import { Question } from "@/question"

describe("HermesReflection", () => {
  it("sanitizes structural XML tags and markdown blocks from errors", () => {
    const rawError = "Error in <tool_call>{\"name\":\"bad\"}</tool_call> with ```json fenced ``` and <output>raw</output>"
    const sanitized = HermesReflection.sanitizeToolError(rawError)

    expect(sanitized).not.toContain("<tool_call>")
    expect(sanitized).not.toContain("</tool_call>")
    expect(sanitized).not.toContain("<output>")
    expect(sanitized).not.toContain("</output>")
    expect(sanitized.startsWith("[TOOL_ERROR]")).toBe(true)
  })

  it("bounds oversized tool errors to prevent token bloat", () => {
    const hugeError = "A".repeat(5000)
    const sanitized = HermesReflection.sanitizeToolError(hugeError, 500)

    expect(sanitized.length).toBeLessThanOrEqual(515)
    expect(sanitized).toContain("...")
  })

  it("correctly identifies recoverable vs non-recoverable errors", () => {
    expect(HermesReflection.isRecoverableToolError(new Error("File not found: src/main.ts"))).toBe(true)
    expect(HermesReflection.isRecoverableToolError(new Error("Command failed with exit code 1"))).toBe(true)
    expect(HermesReflection.isRecoverableToolError(new Error("JSON.parse error: unexpected token"))).toBe(true)

    expect(HermesReflection.isRecoverableToolError(new DOMException("Aborted", "AbortError"))).toBe(false)
    expect(HermesReflection.isRecoverableToolError(new Error("User rejected permission"))).toBe(false)
    expect(HermesReflection.isRecoverableToolError(new PermissionV1.RejectedError())).toBe(false)
    expect(HermesReflection.isRecoverableToolError(new Question.RejectedError())).toBe(false)
  })

  it("generates automated self-correction error reflection guidance", () => {
    const prompt = HermesReflection.buildReflectionPrompt("bash", new Error("Command failed: tsc returned error TS2304"))

    expect(prompt).toContain("[TOOL_ERROR]")
    expect(prompt).toContain("[AUTOMATED ERROR REFLECTION REQUIRED]:")
    expect(prompt).toContain("The execution of tool 'bash' encountered an error")
    expect(prompt).toContain("1. Root Cause:")
    expect(prompt).toContain("2. Alternative Strategy:")
    expect(prompt).toContain("3. Corrective Action:")
  })
})
