import { describe, expect, it } from "bun:test"
import { validateSyntax, formatSyntaxDiagnostic } from "../../src/tool/syntax"

describe("Fast Syntax Validation Hook (Codex Superpower)", () => {
  it("passes valid TypeScript / JavaScript code", () => {
    const validTs = `
      export interface Config {
        port: number
        host: string
      }

      export function startServer(cfg: Config): void {
        console.log("Listening on " + cfg.port)
      }
    `
    const result = validateSyntax("server.ts", validTs)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it("catches syntax errors in TypeScript code", () => {
    const brokenTs = `
      function brokenSyntax( {
        const x = 123
    `
    const result = validateSyntax("broken.ts", brokenTs)
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()

    const warning = formatSyntaxDiagnostic("broken.ts", result)
    expect(warning).toContain("[SYNTAX WARNING]")
    expect(warning).toContain("broken.ts")
  })

  it("validates JSON files properly", () => {
    const validJson = `{"name": "spacecode", "version": 1}`
    const brokenJson = `{"name": "spacecode", "version": }`

    const passResult = validateSyntax("package.json", validJson)
    expect(passResult.valid).toBe(true)

    const failResult = validateSyntax("package.json", brokenJson)
    expect(failResult.valid).toBe(false)
    expect(failResult.error).toContain("JSON syntax error")

    const warning = formatSyntaxDiagnostic("package.json", failResult)
    expect(warning).toContain("[SYNTAX WARNING]")
  })
})
