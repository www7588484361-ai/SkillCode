import path from "node:path"

export interface Tag {
  readonly relFname: string
  readonly fname: string
  readonly line: number
  readonly name: string
  readonly kind: "def" | "ref"
}

const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue",
  "return", "try", "catch", "finally", "throw", "new", "delete", "typeof", "instanceof",
  "void", "this", "super", "class", "extends", "import", "export", "from", "as", "default",
  "const", "let", "var", "function", "interface", "type", "enum", "namespace", "module",
  "declare", "abstract", "implements", "readonly", "static", "public", "private", "protected",
  "async", "await", "yield", "true", "false", "null", "undefined", "any", "unknown", "never",
  "string", "number", "boolean", "symbol", "bigint", "object", "def", "self", "None", "True",
  "False", "elif", "except", "pass", "lambda", "with", "raise", "yield", "fn", "struct",
  "trait", "impl", "pub", "mut", "ref", "use", "mod", "where", "package", "func", "range",
  "go", "select", "chan", "defer",
])

export function extractTags(content: string, fname: string, relFname: string): Tag[] {
  const ext = path.extname(fname).toLowerCase()
  const lines = content.split("\n")
  const tags: Tag[] = []
  const definedNames = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      continue
    }

    const defs = extractDefinitionsFromLine(trimmed, ext, i + 1, fname, relFname)
    for (const def of defs) {
      definedNames.add(def.name)
      tags.push(def)
    }
  }

  // Extract references: all identifiers that are not language keywords and not defined on this line
  const wordRegex = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) continue

    let match: RegExpExecArray | null
    while ((match = wordRegex.exec(line)) !== null) {
      const ident = match[0]
      if (KEYWORDS.has(ident)) continue
      tags.push({
        relFname,
        fname,
        line: i + 1,
        name: ident,
        kind: "ref",
      })
    }
  }

  return tags
}

function extractDefinitionsFromLine(
  line: string,
  ext: string,
  lineNum: number,
  fname: string,
  relFname: string,
): Tag[] {
  const results: Tag[] = []

  // TypeScript / JavaScript
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    // Functions
    const fnMatch = line.match(/(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/)
    if (fnMatch) {
      results.push({ relFname, fname, line: lineNum, name: fnMatch[1], kind: "def" })
    }

    // Classes & Interfaces
    const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?(?:class|interface)\s+([A-Za-z0-9_$]+)/)
    if (classMatch) {
      results.push({ relFname, fname, line: lineNum, name: classMatch[1], kind: "def" })
    }

    // Types & Enums
    const typeMatch = line.match(/(?:export\s+)?(?:type|enum)\s+([A-Za-z0-9_$]+)/)
    if (typeMatch) {
      results.push({ relFname, fname, line: lineNum, name: typeMatch[1], kind: "def" })
    }

    // Arrow function constants or export constants
    const constMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:(?:async\s+)?\([^)]*\)\s*=>|(?:async\s+)?[A-Za-z0-9_$]+\s*=>)/)
    if (constMatch) {
      results.push({ relFname, fname, line: lineNum, name: constMatch[1], kind: "def" })
    }
  }

  // Python
  if (ext === ".py") {
    const pyDef = line.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)/)
    if (pyDef) {
      results.push({ relFname, fname, line: lineNum, name: pyDef[1], kind: "def" })
    }
    const pyClass = line.match(/^class\s+([A-Za-z0-9_]+)/)
    if (pyClass) {
      results.push({ relFname, fname, line: lineNum, name: pyClass[1], kind: "def" })
    }
  }

  // Go
  if (ext === ".go") {
    const goFunc = line.match(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)/)
    if (goFunc) {
      results.push({ relFname, fname, line: lineNum, name: goFunc[1], kind: "def" })
    }
    const goType = line.match(/^type\s+([A-Za-z0-9_]+)\s+(?:struct|interface)/)
    if (goType) {
      results.push({ relFname, fname, line: lineNum, name: goType[1], kind: "def" })
    }
  }

  // Rust
  if (ext === ".rs") {
    const rsFn = line.match(/^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/)
    if (rsFn) {
      results.push({ relFname, fname, line: lineNum, name: rsFn[1], kind: "def" })
    }
    const rsStruct = line.match(/^(?:pub(?:\([^)]+\))?\s+)?(?:struct|enum|trait|type)\s+([A-Za-z0-9_]+)/)
    if (rsStruct) {
      results.push({ relFname, fname, line: lineNum, name: rsStruct[1], kind: "def" })
    }
  }

  return results
}
