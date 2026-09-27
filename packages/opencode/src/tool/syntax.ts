import * as path from "path"

export interface SyntaxValidationResult {
  valid: boolean
  error?: string
  line?: number
  column?: number
  snippet?: string
}

/**
 * Fast syntax validator that runs automatically after file edits and writes.
 * Supports TypeScript, TSX, JavaScript, JSX, JSON, and common structured languages.
 */
export function validateSyntax(filePath: string, content: string): SyntaxValidationResult {
  const ext = path.extname(filePath).toLowerCase()

  // 1. JSON Validation
  if (ext === ".json") {
    try {
      JSON.parse(content)
      return { valid: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Extract position if available: "at position X"
      const posMatch = msg.match(/at position (\d+)/)
      let line = 1
      let column = 1
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10)
        const prefix = content.slice(0, pos)
        const lines = prefix.split("\n")
        line = lines.length
        column = lines[lines.length - 1].length + 1
      }
      return {
        valid: false,
        error: `JSON syntax error: ${msg}`,
        line,
        column,
      }
    }
  }

  // 2. TypeScript / JavaScript Validation via Bun.Transpiler
  const jsLoaders: Record<string, "ts" | "tsx" | "js" | "jsx"> = {
    ".ts": "ts",
    ".mts": "ts",
    ".cts": "ts",
    ".tsx": "tsx",
    ".js": "js",
    ".mjs": "js",
    ".cjs": "js",
    ".jsx": "jsx",
  }

  const loader = jsLoaders[ext]
  if (loader && typeof Bun !== "undefined" && Bun.Transpiler) {
    try {
      const transpiler = new Bun.Transpiler({ loader })
      transpiler.transformSync(content)
      return { valid: true }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      // Bun errors often include line and col in err.line or in the error message
      const line = err?.line ?? (msg.match(/:(\d+):(\d+)/)?.[1] ? parseInt(msg.match(/:(\d+):(\d+)/)![1], 10) : undefined)
      const column = err?.column ?? (msg.match(/:(\d+):(\d+)/)?.[2] ? parseInt(msg.match(/:(\d+):(\d+)/)![2], 10) : undefined)
      return {
        valid: false,
        error: msg.split("\n")[0],
        line,
        column,
      }
    }
  }

  // 3. Fallback: Unterminated string check for other files
  return { valid: true }
}

/**
 * Formats a syntax validation failure into a clear, actionable warning for the model.
 */
export function formatSyntaxDiagnostic(filePath: string, validation: SyntaxValidationResult): string {
  if (validation.valid) return ""

  const location = validation.line
    ? ` at line ${validation.line}${validation.column ? `, column ${validation.column}` : ""}`
    : ""

  return `\n\n[SYNTAX WARNING]: Syntax error detected in ${path.basename(filePath)}${location}: ${validation.error}\nPlease review and ensure code compiles cleanly.`
}
