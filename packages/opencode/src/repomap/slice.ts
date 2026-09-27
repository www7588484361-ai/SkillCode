import * as path from "path"
import * as fs from "fs"

export interface ImportedSymbol {
  name: string
  alias?: string
  isTypeOnly?: boolean
}

export interface FileImport {
  source: string
  symbols: ImportedSymbol[]
  isWildcard: boolean
  isDefault: boolean
  defaultName?: string
  rawStatement: string
}

export interface DependencySliceResult {
  targetFile: string
  dependencies: Array<{
    importSource: string
    resolvedPath: string | null
    symbols: string[]
    sliceText: string
  }>
  totalSymbols: number
  totalDependencies: number
  rendered: string
}

/**
 * Extracts import declarations and imported symbols from TypeScript/JavaScript/Python source.
 */
export function extractImports(sourceCode: string, ext = ".ts"): FileImport[] {
  const imports: FileImport[] = []

  if (ext === ".py") {
    // Python imports: from .module import foo, bar OR import foo
    const pyFromRegex = /^(?:from\s+([.\w]+)\s+import\s+([^#\n]+))/gm
    let match: RegExpExecArray | null
    while ((match = pyFromRegex.exec(sourceCode)) !== null) {
      const src = match[1]
      const symList = match[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      imports.push({
        source: src,
        symbols: symList.map((s) => {
          const parts = s.split(/\s+as\s+/)
          return { name: parts[0], alias: parts[1] }
        }),
        isWildcard: symList.includes("*"),
        isDefault: false,
        rawStatement: match[0],
      })
    }
    return imports
  }

  // TypeScript / JavaScript imports
  // 1. Named imports: import { A, B as C, type D } from "..."
  const namedImportRegex =
    /import\s+(?:type\s+)?(?:(\w+)\s*,\s*)?(?:\{([^}]+)\}|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = namedImportRegex.exec(sourceCode)) !== null) {
    const defaultName = m[1]
    const namedClause = m[2]
    const wildcardName = m[3]
    const source = m[4]

    const symbols: ImportedSymbol[] = []
    if (defaultName) {
      symbols.push({ name: defaultName })
    }
    if (wildcardName) {
      symbols.push({ name: wildcardName })
    }
    if (namedClause) {
      const parts = namedClause.split(",")
      for (const rawPart of parts) {
        const trimmed = rawPart.trim()
        if (!trimmed) continue
        const isType = trimmed.startsWith("type ")
        const clean = isType ? trimmed.slice(5).trim() : trimmed
        const asMatch = clean.split(/\s+as\s+/)
        symbols.push({
          name: asMatch[0].trim(),
          alias: asMatch[1]?.trim(),
          isTypeOnly: isType,
        })
      }
    }

    imports.push({
      source,
      symbols,
      isWildcard: !!wildcardName,
      isDefault: !!defaultName,
      defaultName,
      rawStatement: m[0],
    })
  }

  // 2. Default-only import: import Foo from "..."
  const defaultImportRegex = /import\s+(?:type\s+)?(\w+)\s+from\s+['"]([^'"]+)['"]/g
  while ((m = defaultImportRegex.exec(sourceCode)) !== null) {
    const defaultName = m[1]
    const source = m[2]
    if (!imports.some((i) => i.source === source && i.defaultName === defaultName)) {
      imports.push({
        source,
        symbols: [{ name: defaultName }],
        isWildcard: false,
        isDefault: true,
        defaultName,
        rawStatement: m[0],
      })
    }
  }

  // 3. CommonJS require: const { a, b } = require("...") or const a = require("...")
  const requireRegex = /(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\(['"]([^'"]+)['"]\)/g
  while ((m = requireRegex.exec(sourceCode)) !== null) {
    const destructuring = m[1]
    const varName = m[2]
    const source = m[3]
    const symbols: ImportedSymbol[] = []

    if (varName) {
      symbols.push({ name: varName })
    }
    if (destructuring) {
      const parts = destructuring.split(",")
      for (const part of parts) {
        const clean = part.trim()
        if (clean) {
          const asMatch = clean.split(":")
          symbols.push({
            name: asMatch[0].trim(),
            alias: asMatch[1]?.trim(),
          })
        }
      }
    }

    imports.push({
      source,
      symbols,
      isWildcard: false,
      isDefault: !!varName,
      defaultName: varName,
      rawStatement: m[0],
    })
  }

  return imports
}

/**
 * Resolves a module import specifier to a physical file path in the workspace.
 */
export function resolveImportPath(importSource: string, fromFile: string, worktree: string): string | null {
  const fromDir = path.dirname(fromFile)
  const candidateExtensions = [".ts", ".tsx", ".js", ".jsx", ".d.ts", ".json"]

  // Handle local relative imports
  if (importSource.startsWith("./") || importSource.startsWith("../")) {
    const basePath = path.resolve(fromDir, importSource)

    // Direct match
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
      return basePath
    }

    // Try extensions
    for (const ext of candidateExtensions) {
      const withExt = basePath + ext
      if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
        return withExt
      }
    }

    // Try index files
    for (const ext of candidateExtensions) {
      const indexFile = path.join(basePath, "index" + ext)
      if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
        return indexFile
      }
    }
  }

  // Handle path aliases (e.g. "@/..." pointing to worktree/src)
  if (importSource.startsWith("@/")) {
    const relativeTarget = importSource.slice(2)
    const candidates = [
      path.resolve(worktree, "src", relativeTarget),
      path.resolve(worktree, relativeTarget),
    ]

    for (const base of candidates) {
      if (fs.existsSync(base) && fs.statSync(base).isFile()) {
        return base
      }
      for (const ext of candidateExtensions) {
        const withExt = base + ext
        if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
          return withExt
        }
      }
      for (const ext of candidateExtensions) {
        const indexFile = path.join(base, "index" + ext)
        if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
          return indexFile
        }
      }
    }
  }

  return null
}

/**
 * Extracts the declaration / interface / type / function signature for specified symbols from code.
 */
export function extractSymbolSignatures(sourceCode: string, symbols: string[]): string {
  const lines = sourceCode.split(/\r?\n/)
  const extractedChunks: string[] = []
  const foundSymbols = new Set<string>()

  for (const sym of symbols) {
    if (foundSymbols.has(sym)) continue

    // Regex to match start of declaration
    // Matches:
    // export (async)? function sym(...)
    // export (const|let) sym = ...
    // export interface sym ...
    // export type sym = ...
    // export class sym ...
    // export enum sym ...
    const declRegex = new RegExp(
      `^(?:export\\s+)?(?:declare\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\*?\\s+|class\\s+|interface\\s+|type\\s+|enum\\s+|(?:const|let|var)\\s+)${sym}\\b`,
    )

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (declRegex.test(line.trim())) {
        foundSymbols.add(sym)

        // Capture declaration block
        // If it's a one-liner (e.g. type X = string; or function signature declare)
        if (line.includes(";") && !line.includes("{")) {
          extractedChunks.push(line.trim())
          break
        }

        // Multiline block: capture until matching brace or semicolon
        let braceCount = 0
        let started = false
        const blockLines: string[] = []

        for (let j = i; j < Math.min(lines.length, i + 50); j++) {
          const cur = lines[j]
          blockLines.push(cur)

          for (const char of cur) {
            if (char === "{") {
              braceCount++
              started = true
            } else if (char === "}") {
              braceCount--
            }
          }

          if (started && braceCount <= 0) {
            break
          }
          if (!started && cur.includes(";")) {
            break
          }
        }

        extractedChunks.push(blockLines.join("\n").trim())
        break
      }
    }
  }

  return extractedChunks.join("\n\n")
}

/**
 * High-level dependency slicing: traces imports of target file and extracts symbol signatures.
 */
export function sliceFileDependencies(targetFilePath: string, worktree: string): DependencySliceResult {
  if (!fs.existsSync(targetFilePath)) {
    throw new Error(`Target file does not exist: ${targetFilePath}`)
  }

  const code = fs.readFileSync(targetFilePath, "utf-8")
  const ext = path.extname(targetFilePath).toLowerCase()
  const fileImports = extractImports(code, ext)

  const dependencies: DependencySliceResult["dependencies"] = []
  let totalSymbols = 0

  for (const imp of fileImports) {
    const resolved = resolveImportPath(imp.source, targetFilePath, worktree)
    const symbolNames = imp.symbols.map((s) => s.name)

    if (resolved && fs.existsSync(resolved)) {
      try {
        const depCode = fs.readFileSync(resolved, "utf-8")
        const sliceText = extractSymbolSignatures(depCode, symbolNames)

        if (sliceText) {
          totalSymbols += symbolNames.length
          dependencies.push({
            importSource: imp.source,
            resolvedPath: path.relative(worktree, resolved).replaceAll("\\", "/"),
            symbols: symbolNames,
            sliceText,
          })
          continue
        }
      } catch {
        // Fall back to import statement
      }
    }

    // Fallback if external package or no slice extracted
    dependencies.push({
      importSource: imp.source,
      resolvedPath: resolved ? path.relative(worktree, resolved).replaceAll("\\", "/") : null,
      symbols: symbolNames,
      sliceText: imp.rawStatement,
    })
  }

  // Format the rendered output
  const outputLines: string[] = [
    `// Dependency Symbol Slice for: ${path.relative(worktree, targetFilePath).replaceAll("\\", "/")}`,
    `// Extracted ${totalSymbols} symbols across ${dependencies.length} dependencies:`,
    "",
  ]

  for (const dep of dependencies) {
    const header = dep.resolvedPath ? `=== ${dep.resolvedPath} (${dep.importSource}) ===` : `=== ${dep.importSource} (external/unresolved) ===`
    outputLines.push(header)
    outputLines.push(dep.sliceText)
    outputLines.push("")
  }

  return {
    targetFile: targetFilePath,
    dependencies,
    totalSymbols,
    totalDependencies: dependencies.length,
    rendered: outputLines.join("\n").trim(),
  }
}
