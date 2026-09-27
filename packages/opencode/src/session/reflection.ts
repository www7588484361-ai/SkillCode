import { PermissionV1 } from "@spacecode/core/v1/permission"
import { Question } from "@/question"
import { errorMessage } from "@/util/error"

export namespace HermesReflection {
  export const MAX_TOOL_ERROR_LEN = 2_048

  const STRUCTURAL_TAG_RES = [
    /<\/?(?:tool_call|function_call|result|response|output|input|system|assistant|user)>/gi,
    /<!\[CDATA\[.*?\]\]>/gs,
    /^\s*```(?:json|xml|html|markdown)?\s*/gim,
    /\s*```\s*$/gim,
  ]

  /**
   * Strips raw protocol scaffolding and structural framing tokens from a tool error
   * before presenting it to the agent, bounding error length to prevent token bloat.
   */
  export function sanitizeToolError(error: unknown, maxLen: number = MAX_TOOL_ERROR_LEN): string {
    const raw = errorMessage(error)
    if (!raw) return "[TOOL_ERROR] Unknown tool error occurred"

    let sanitized = raw
    for (const pattern of STRUCTURAL_TAG_RES) {
      sanitized = sanitized.replace(pattern, "")
    }
    sanitized = sanitized.trim()

    if (sanitized.length > maxLen) {
      sanitized = sanitized.slice(0, maxLen - 3) + "..."
    }

    return sanitized.startsWith("[TOOL_ERROR]") ? sanitized : `[TOOL_ERROR] ${sanitized}`
  }

  /**
   * Distinguishes non-recoverable errors (user rejections, explicit aborts)
   * from recoverable execution errors that warrant an automated reflection cycle.
   */
  export function isRecoverableToolError(error: unknown): boolean {
    if (error instanceof PermissionV1.RejectedError || error instanceof Question.RejectedError) {
      return false
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return false
    }
    const msg = errorMessage(error).toLowerCase()
    if (msg.includes("aborted") || msg.includes("permission rejected") || msg.includes("user rejected")) {
      return false
    }
    return true
  }

  /**
   * Constructs the automated self-correction error reflection guidance.
   * Hermes agent uses this pattern to force the model to analyze failure roots
   * and retry or adapt instead of prematurely halting.
   */
  export function buildReflectionPrompt(toolName: string, error: unknown): string {
    const sanitized = sanitizeToolError(error)
    return `${sanitized}

[AUTOMATED ERROR REFLECTION REQUIRED]:
The execution of tool '${toolName}' encountered an error. Before asking the user or stopping work:
1. Root Cause: Analyze why '${toolName}' failed with the error above.
2. Alternative Strategy: Check if paths, parameters, syntax, or permissions were incorrect, or if an alternative tool is available.
3. Corrective Action: Formulate and execute the corrective action immediately.`
  }
}
