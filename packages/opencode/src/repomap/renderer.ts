import type { RankedTag } from "./graph"

export interface RenderOptions {
  readonly maxTokens?: number
  readonly fileContents?: Map<string, string>
}

export function renderRepoMap(rankedTags: RankedTag[], options: RenderOptions = {}): string {
  const maxTokens = options.maxTokens ?? 1024
  const maxChars = maxTokens * 4 // Approximation: 1 token ~ 4 characters

  if (rankedTags.length === 0) return ""

  // Group tags by file preserving rank order
  const fileTagsMap = new Map<string, RankedTag[]>()
  for (const item of rankedTags) {
    let list = fileTagsMap.get(item.tag.relFname)
    if (!list) {
      list = []
      fileTagsMap.set(item.tag.relFname, list)
    }
    list.push(item)
  }

  // Binary search to find how many top files/tags fit in the token budget
  let low = 1
  let high = fileTagsMap.size
  let bestOutput = ""

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const candidateFiles = Array.from(fileTagsMap.entries()).slice(0, mid)
    const rendered = renderCandidateFiles(candidateFiles, options.fileContents)

    if (rendered.length <= maxChars) {
      bestOutput = rendered
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return bestOutput || renderCandidateFiles(Array.from(fileTagsMap.entries()).slice(0, 1), options.fileContents)
}

function renderCandidateFiles(
  entries: [string, RankedTag[]][],
  fileContents?: Map<string, string>,
): string {
  const outputLines: string[] = []

  for (const [relFname, items] of entries) {
    outputLines.push(`${relFname}:`)

    const content = fileContents?.get(relFname)
    if (content) {
      const lines = content.split("\n")
      // Sort lines of interest
      const sortedItems = [...items].sort((a, b) => a.tag.line - b.tag.line)
      const seenLines = new Set<number>()

      for (const item of sortedItems) {
        const lineIdx = item.tag.line - 1
        if (lineIdx >= 0 && lineIdx < lines.length && !seenLines.has(lineIdx)) {
          seenLines.add(lineIdx)
          const lineText = lines[lineIdx].trimEnd()
          outputLines.push(`  ${lineText}`)
        }
      }
    } else {
      // Fallback: render symbol signatures
      for (const item of items) {
        outputLines.push(`  ${item.tag.kind === "def" ? "def" : "ref"} ${item.tag.name} (line ${item.tag.line})`)
      }
    }
    outputLines.push("")
  }

  return outputLines.join("\n").trim()
}
