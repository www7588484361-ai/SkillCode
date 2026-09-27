import type { Tag } from "./tag"

export interface RankedTag {
  readonly tag: Tag
  readonly rank: number
}

export interface GraphOptions {
  readonly chatFiles?: string[]
  readonly otherFiles?: string[]
  readonly mentionedFiles?: string[]
  readonly mentionedIdents?: string[]
}

export function rankTags(tagsByFile: Map<string, Tag[]>, options: GraphOptions = {}): RankedTag[] {
  const chatFiles = new Set(options.chatFiles ?? [])
  const mentionedFiles = new Set(options.mentionedFiles ?? [])
  const mentionedIdents = new Set(options.mentionedIdents ?? [])

  const defines = new Map<string, Set<string>>()
  const references = new Map<string, string[]>()
  const definitions = new Map<string, Tag[]>() // key: `${relFname}::${ident}`

  const allFiles = Array.from(tagsByFile.keys())
  if (allFiles.length === 0) return []

  // 1. Populate defines, references, definitions
  for (const [relFname, tags] of tagsByFile.entries()) {
    for (const tag of tags) {
      if (tag.kind === "def") {
        let defSet = defines.get(tag.name)
        if (!defSet) {
          defSet = new Set()
          defines.set(tag.name, defSet)
        }
        defSet.add(relFname)

        const key = `${relFname}::${tag.name}`
        let tagList = definitions.get(key)
        if (!tagList) {
          tagList = []
          definitions.set(key, tagList)
        }
        tagList.push(tag)
      } else if (tag.kind === "ref") {
        let refList = references.get(tag.name)
        if (!refList) {
          refList = []
          references.set(tag.name, refList)
        }
        refList.push(relFname)
      }
    }
  }

  // 2. Personalization vector
  const personalization = new Map<string, number>()
  const basePersonalize = 100 / allFiles.length

  for (const file of allFiles) {
    let score = 0
    if (chatFiles.has(file)) score += basePersonalize * 2
    if (mentionedFiles.has(file)) score += basePersonalize * 2
    personalization.set(file, score > 0 ? score : basePersonalize)
  }

  // Normalize personalization vector
  const totalPers = Array.from(personalization.values()).reduce((a, b) => a + b, 0)
  for (const [k, v] of personalization.entries()) {
    personalization.set(k, v / (totalPers || 1))
  }

  // 3. Build Adjacency Matrix with edge weights
  // edges: Map<src, Map<dst, { weight: number, ident: string }[]>>
  interface Edge {
    dst: string
    weight: number
    ident: string
  }
  const outEdges = new Map<string, Edge[]>()
  for (const file of allFiles) {
    outEdges.set(file, [])
  }

  const commonIdents = Array.from(defines.keys()).filter((id) => references.has(id))

  for (const ident of commonIdents) {
    const definers = defines.get(ident)!
    const referencers = references.get(ident)!

    // Compute multiplier
    let mul = 1.0
    const isSnake = ident.includes("_") && /[a-zA-Z]/.test(ident)
    const isCamel = /[a-z]/.test(ident) && /[A-Z]/.test(ident)
    if (mentionedIdents.has(ident)) mul *= 10
    if ((isSnake || isCamel) && ident.length >= 8) mul *= 10
    if (ident.startsWith("_")) mul *= 0.1
    if (definers.size > 5) mul *= 0.1

    // Count references per referencer file
    const refCounts = new Map<string, number>()
    for (const ref of referencers) {
      refCounts.set(ref, (refCounts.get(ref) ?? 0) + 1)
    }

    for (const [referencer, count] of refCounts.entries()) {
      if (!outEdges.has(referencer)) continue
      let useMul = mul
      if (chatFiles.has(referencer)) useMul *= 50
      const weight = useMul * Math.sqrt(count)

      for (const definer of definers) {
        outEdges.get(referencer)!.push({ dst: definer, weight, ident })
      }
    }
  }

  // 4. Personalized PageRank power iteration
  const d = 0.85
  const n = allFiles.length
  let p = new Map<string, number>()
  for (const file of allFiles) {
    p.set(file, personalization.get(file) ?? 1 / n)
  }

  // Precompute out-weight sums
  const outWeightSum = new Map<string, number>()
  for (const [src, edges] of outEdges.entries()) {
    outWeightSum.set(src, edges.reduce((acc, e) => acc + e.weight, 0))
  }

  for (let iter = 0; iter < 40; iter++) {
    const nextP = new Map<string, number>()
    for (const file of allFiles) {
      nextP.set(file, (1 - d) * (personalization.get(file) ?? 1 / n))
    }

    let danglingSum = 0
    for (const file of allFiles) {
      const sum = outWeightSum.get(file) ?? 0
      if (sum === 0) {
        danglingSum += p.get(file) ?? 0
      }
    }

    for (const file of allFiles) {
      const currentRank = nextP.get(file)! + d * danglingSum * (personalization.get(file) ?? 1 / n)
      nextP.set(file, currentRank)
    }

    for (const [src, edges] of outEdges.entries()) {
      const sum = outWeightSum.get(src) ?? 0
      if (sum === 0) continue
      const srcRank = p.get(src) ?? 0
      for (const edge of edges) {
        const transfer = (d * srcRank * edge.weight) / sum
        nextP.set(edge.dst, (nextP.get(edge.dst) ?? 0) + transfer)
      }
    }

    // Convergence check
    let diff = 0
    for (const file of allFiles) {
      diff += Math.abs((nextP.get(file) ?? 0) - (p.get(file) ?? 0))
    }
    p = nextP
    if (diff < 1e-5) break
  }

  // 5. Distribute node rank to definitions
  const rankedDefinitions = new Map<string, number>() // key: `${relFname}::${ident}`
  for (const [src, edges] of outEdges.entries()) {
    const srcRank = p.get(src) ?? 0
    const sum = outWeightSum.get(src) ?? 0
    if (sum === 0) continue
    for (const edge of edges) {
      const edgeRank = (srcRank * edge.weight) / sum
      const key = `${edge.dst}::${edge.ident}`
      rankedDefinitions.set(key, (rankedDefinitions.get(key) ?? 0) + edgeRank)
    }
  }

  // Fallback: any definition without incoming edge inherits base node rank
  for (const [file, rank] of p.entries()) {
    const fileTags = tagsByFile.get(file) ?? []
    for (const tag of fileTags) {
      if (tag.kind === "def") {
        const key = `${file}::${tag.name}`
        if (!rankedDefinitions.has(key)) {
          rankedDefinitions.set(key, rank * 0.1)
        }
      }
    }
  }

  // 6. Sort and assemble ranked tags
  const rankedList: RankedTag[] = []
  const sortedDefs = Array.from(rankedDefinitions.entries()).sort((a, b) => b[1] - a[1])

  const seen = new Set<string>()
  for (const [key, rank] of sortedDefs) {
    const tags = definitions.get(key) ?? []
    for (const tag of tags) {
      const tagId = `${tag.relFname}:${tag.line}:${tag.name}`
      if (!seen.has(tagId)) {
        seen.add(tagId)
        rankedList.push({ tag, rank })
      }
    }
  }

  return rankedList
}
