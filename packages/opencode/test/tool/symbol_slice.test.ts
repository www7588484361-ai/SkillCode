import { describe, expect, it } from "bun:test"
import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import {
  extractImports,
  resolveImportPath,
  extractSymbolSignatures,
  sliceFileDependencies,
} from "../../src/repomap/slice"

describe("Smart Dependency & Symbol Slicing (Codex Superpower)", () => {
  it("extracts TypeScript named, default, and aliased imports", () => {
    const code = `
      import { UserService, type UserConfig as Cfg } from "./user.service"
      import DefaultClient from "./client"
      import * as utils from "../utils"
      const { parse } = require("./parser")
    `
    const imports = extractImports(code, ".ts")

    expect(imports.length).toBe(4)

    const userImport = imports.find((i) => i.source === "./user.service")
    expect(userImport).toBeDefined()
    expect(userImport?.symbols.some((s) => s.name === "UserService")).toBe(true)
    expect(userImport?.symbols.some((s) => s.name === "UserConfig" && s.alias === "Cfg" && s.isTypeOnly)).toBe(true)

    const clientImport = imports.find((i) => i.source === "./client")
    expect(clientImport?.isDefault).toBe(true)
    expect(clientImport?.defaultName).toBe("DefaultClient")

    const utilsImport = imports.find((i) => i.source === "../utils")
    expect(utilsImport?.isWildcard).toBe(true)
  })

  it("extracts symbol signatures (interfaces, types, functions, classes)", () => {
    const depCode = `
      export interface User {
        id: string
        name: string
      }

      export type Role = "admin" | "member"

      export function calculateDiscount(price: number): number {
        const factor = 0.9
        return price * factor
      }

      export class OrderManager {
        process() {}
      }

      const UNRELATED = 123
    `

    const slice = extractSymbolSignatures(depCode, ["User", "Role", "calculateDiscount"])

    expect(slice).toContain("export interface User")
    expect(slice).toContain("id: string")
    expect(slice).toContain("export type Role = \"admin\" | \"member\"")
    expect(slice).toContain("export function calculateDiscount")
    expect(slice).not.toContain("UNRELATED")
  })

  it("sliceFileDependencies generates a condensed slice across real files", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spacecode-slice-test-"))
    try {
      const typesFile = path.join(tempDir, "types.ts")
      fs.writeFileSync(
        typesFile,
        `
        export interface SessionData {
          token: string
          expiresAt: number
        }
        export type Status = "active" | "expired"
        `,
      )

      const authFile = path.join(tempDir, "auth.ts")
      fs.writeFileSync(
        authFile,
        `
        import { SessionData, Status } from "./types"

        export function validate(session: SessionData): Status {
          return session.expiresAt > Date.now() ? "active" : "expired"
        }
        `,
      )

      const result = sliceFileDependencies(authFile, tempDir)

      expect(result.totalDependencies).toBe(1)
      expect(result.totalSymbols).toBe(2)
      expect(result.rendered).toContain("Dependency Symbol Slice")
      expect(result.rendered).toContain("export interface SessionData")
      expect(result.rendered).toContain("export type Status")
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
