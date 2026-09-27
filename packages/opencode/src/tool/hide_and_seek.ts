import path from "node:path"
import fs from "node:fs"
import { spawn, type ChildProcess } from "node:child_process"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description:
      "The target file/folder name, wildcard pattern, or natural query (e.g. '*.json', 'settings', 'app.cfg', 'test 0000', 'latest folder', 'recently downloaded').",
  }),
  start_path: Schema.optional(Schema.String).annotate({
    description:
      "The directory path to start scanning from. If omitted or set to root/user drive, smart multi-tier priority search is automatically applied.",
  }),
  include_hidden: Schema.optional(Schema.Boolean).annotate({
    description: "Whether to include hidden, system, and archive files/folders in the search. Defaults to true.",
  }),
  target_type: Schema.optional(Schema.Literals(["file", "folder", "all"])).annotate({
    description:
      "Type of items to locate: 'file' (files only), 'folder' (directories only), or 'all' (both files and folders). Defaults to 'all'.",
  }),
  max_results: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of matching paths to return. Defaults to 20.",
  }),
})

export interface ScanOptions {
  startPath: string
  query: string
  includeHidden?: boolean
  targetType?: "file" | "folder" | "all"
  maxResults?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface CandidateDetail {
  path: string
  name: string
  isDir: boolean
  mtimeMs: number
  modified: string
  size: number
  formattedSize: string
  isExact: boolean
  isPrefix: boolean
}

export interface ScanResult {
  results: string[]
  durationMs: number
  timedOut: boolean
  startPath: string
  query: string
  targetType: "file" | "folder" | "all"
  includeHidden: boolean
  error?: string
  candidates: CandidateDetail[]
  recencyQuery?: boolean
}

function killProc(proc: ChildProcess) {
  if (!proc.pid || proc.killed) return
  try {
    proc.kill("SIGKILL")
  } catch {}
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", proc.pid.toString()], {
        windowsHide: true,
        stdio: "ignore",
      })
    } catch {}
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatSearchPattern(query: string): string {
  const trimmed = query.trim()
  if (!trimmed) return "*"

  // If user passed specific wildcards without spaces (e.g. "*.json", "*.cfg", "app*")
  if ((trimmed.includes("*") || trimmed.includes("?")) && !/\s+/.test(trimmed)) {
    return trimmed
  }

  // Check if query contains an extension (e.g. "app.cfg", "config.ini", "server log.txt")
  const lastDotIndex = trimmed.lastIndexOf(".")
  if (lastDotIndex > 0 && lastDotIndex < trimmed.length - 1) {
    const basePart = trimmed.slice(0, lastDotIndex)
    const extPart = trimmed.slice(lastDotIndex + 1)
    if (/^[a-zA-Z0-9_-]+$/.test(extPart)) {
      const baseTokens = basePart.split(/\s+/).filter(Boolean)
      const basePattern = baseTokens.length > 0 ? `*${baseTokens.join("*")}*` : "*"
      return `${basePattern}.${extPart}*`
    }
  }

  // If no extension is given: broad wildcard matching any file/folder format (.cfg, .ini, .log, .json, etc.)
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length > 1) {
    return `*${parts.join("*")}*`
  }
  return `*${trimmed}*`
}

export function isRecencyQuery(query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q || q === "*" || q === "*.*") return true
  return /\b(latest|recent|recently|newest|last modified|recently downloaded|latest folder|latest file|recent files|recent folders|recent downloads|latest downloads)\b/i.test(
    q,
  )
}

export function parseRecencyIntent(query: string, defaultType: "file" | "folder" | "all") {
  const q = query.toLowerCase()
  let targetType = defaultType
  if (/\b(folder|dir|directory|directories|folders)\b/i.test(q)) {
    targetType = "folder"
  } else if (/\b(file|files)\b/i.test(q)) {
    targetType = "file"
  }

  const userProfile = process.env.USERPROFILE || "C:\\Users\\sahil"
  const oneDrive = process.env.ONEDRIVE || path.join(userProfile, "OneDrive")

  let preferredDir: string | null = null
  if (/\b(download|downloads|downloaded)\b/i.test(q)) {
    preferredDir = path.join(userProfile, "Downloads")
  } else if (/\b(desktop)\b/i.test(q)) {
    preferredDir = fs.existsSync(path.join(oneDrive, "Desktop"))
      ? path.join(oneDrive, "Desktop")
      : path.join(userProfile, "Desktop")
  } else if (/\b(doc|docs|document|documents)\b/i.test(q)) {
    preferredDir = fs.existsSync(path.join(oneDrive, "Documents"))
      ? path.join(oneDrive, "Documents")
      : path.join(userProfile, "Documents")
  }

  return { targetType, preferredDir }
}

export function sortAndEnrichCandidates(paths: string[], query: string): CandidateDetail[] {
  const q = query.trim().toLowerCase()
  const lastDot = q.lastIndexOf(".")
  const qBase = lastDot > 0 ? q.slice(0, lastDot) : q
  const qExt = lastDot > 0 ? q.slice(lastDot).toLowerCase() : ""

  const enriched: CandidateDetail[] = []
  const seen = new Set<string>()

  for (const p of paths) {
    const normalized = path.normalize(p)
    if (seen.has(normalized.toLowerCase())) continue
    seen.add(normalized.toLowerCase())

    try {
      const stat = fs.statSync(p)
      const isDir = stat.isDirectory()
      const baseName = path.basename(p)
      const lowerBase = baseName.toLowerCase()
      const itemLastDot = lowerBase.lastIndexOf(".")
      const itemBaseNoExt = itemLastDot > 0 ? lowerBase.slice(0, itemLastDot) : lowerBase

      // Exact match check:
      // 1. Full basename equals query (e.g. "settings.json" === "settings.json")
      // 2. Or query had no extension and itemBaseNoExt equals query (e.g. "settings" matches "settings.cfg", "settings.ini")
      const isExact = lowerBase === q || (!qExt && itemBaseNoExt === q)
      const isPrefix = lowerBase.startsWith(q) || (!qExt && itemBaseNoExt.startsWith(q))

      enriched.push({
        path: p,
        name: baseName,
        isDir,
        mtimeMs: stat.mtimeMs,
        modified: stat.mtime.toLocaleString(),
        size: stat.size,
        formattedSize: isDir ? "[Directory]" : formatBytes(stat.size),
        isExact,
        isPrefix,
      })
    } catch {
      enriched.push({
        path: p,
        name: path.basename(p),
        isDir: false,
        mtimeMs: 0,
        modified: "Unknown",
        size: 0,
        formattedSize: "Unknown",
        isExact: false,
        isPrefix: false,
      })
    }
  }

  // Sort candidates with priority:
  // 1. Exact name match over fuzzy substring
  // 2. Most recently modified (mtimeMs descending)
  enriched.sort((a, b) => {
    if (a.isExact !== b.isExact) {
      return a.isExact ? -1 : 1
    }
    if (a.isPrefix !== b.isPrefix) {
      return a.isPrefix ? -1 : 1
    }
    return b.mtimeMs - a.mtimeMs
  })

  return enriched
}

export function getRecentCandidates(
  dirPaths: string[],
  targetType: "file" | "folder" | "all",
  maxResults = 5,
): CandidateDetail[] {
  const allPaths: string[] = []
  for (const dir of dirPaths) {
    if (!fs.existsSync(dir)) continue
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const isDir = entry.isDirectory()
        if (targetType === "folder" && !isDir) continue
        if (targetType === "file" && isDir) continue
        allPaths.push(path.join(dir, entry.name))
      }
    } catch {}
  }

  const enriched = sortAndEnrichCandidates(allPaths, "*")
  return enriched.slice(0, maxResults)
}

export function isBroadSearch(startPath?: string): boolean {
  if (!startPath) return true
  const norm = path.resolve(startPath).replace(/\\/g, "/").toLowerCase()
  const userProfile = (process.env.USERPROFILE || "").replace(/\\/g, "/").toLowerCase()

  // Drive roots: "c:/", "c:", "d:/", "/"
  if (/^[a-z]:\/?$/i.test(norm) || norm === "/") return true

  // Windows User root or User Profile
  if (norm === "c:/users" || norm === userProfile) return true

  return false
}

export function getTier1Directories(workspaceDir?: string): string[] {
  const dirs = new Set<string>()
  const userProfile = process.env.USERPROFILE || "C:\\Users\\sahil"
  const oneDrive = process.env.ONEDRIVE || path.join(userProfile, "OneDrive")

  // Common user locations
  const candidates = [
    path.join(userProfile, "Downloads"),
    path.join(oneDrive, "Desktop"),
    path.join(userProfile, "Desktop"),
    path.join(oneDrive, "Documents"),
    path.join(userProfile, "Documents"),
  ]

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        dirs.add(path.resolve(c))
      }
    } catch {}
  }

  if (workspaceDir && fs.existsSync(workspaceDir)) {
    dirs.add(path.resolve(workspaceDir))
  }

  return Array.from(dirs)
}

export function getTier2Directories(): string[] {
  const userProfile = process.env.USERPROFILE || "C:\\Users\\sahil"
  if (!fs.existsSync(userProfile)) return []

  try {
    const items = fs.readdirSync(userProfile, { withFileTypes: true })
    const skipDirs = new Set([
      "appdata",
      "downloads",
      "documents",
      "desktop",
      "node_modules",
      ".cache",
      "$recycle.bin",
      "application data",
    ])

    const dirs: string[] = []
    for (const item of items) {
      if (!item.isDirectory()) continue
      const lower = item.name.toLowerCase()
      if (skipDirs.has(lower)) continue
      dirs.push(path.join(userProfile, item.name))
    }

    // Also include AppData/Roaming which has user configs
    const roaming = path.join(userProfile, "AppData", "Roaming")
    if (fs.existsSync(roaming)) {
      dirs.push(roaming)
    }

    return dirs
  } catch {
    return []
  }
}

export function executeScan(options: ScanOptions): Promise<ScanResult> {
  const {
    startPath,
    query,
    includeHidden = true,
    targetType = "all",
    maxResults = 20,
    timeoutMs = 15000,
    signal,
  } = options

  return new Promise((resolve) => {
    const start = performance.now()

    if (!fs.existsSync(startPath)) {
      return resolve({
        results: [],
        candidates: [],
        durationMs: Math.round(performance.now() - start),
        timedOut: false,
        startPath,
        query,
        targetType,
        includeHidden,
        error: `Start path does not exist: ${startPath}`,
      })
    }

    if (signal?.aborted) {
      return resolve({
        results: [],
        candidates: [],
        durationMs: Math.round(performance.now() - start),
        timedOut: false,
        startPath,
        query,
        targetType,
        includeHidden,
      })
    }

    const pattern = formatSearchPattern(query)
    const isWin = process.platform === "win32"
    let p: ChildProcess

    if (isWin) {
      let attrFlag = "/a"
      if (targetType === "folder") {
        attrFlag = includeHidden ? "/a:d" : "/a:d-h"
      } else if (targetType === "file") {
        attrFlag = includeHidden ? "/a:-d" : "/a:-d-h"
      } else {
        attrFlag = includeHidden ? "/a" : "/a:-h"
      }

      const target = path.join(startPath, pattern)
      const cmdLine = `dir "${target}" /s /b ${attrFlag}`

      p = spawn("cmd.exe", ["/d", "/s", "/c", cmdLine], {
        windowsVerbatimArguments: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      })
    } else {
      const args = [startPath, "-name", pattern]
      if (targetType === "file") {
        args.push("-type", "f")
      } else if (targetType === "folder") {
        args.push("-type", "d")
      }
      if (!includeHidden) {
        args.push("!", "-path", "*/.*")
      }

      p = spawn("find", args, {
        stdio: ["ignore", "pipe", "pipe"],
      })
    }

    const collected: string[] = []
    let remainder = ""
    let timedOut = false
    let completed = false

    const timer = setTimeout(() => {
      timedOut = true
      killProc(p)
    }, timeoutMs)

    function finish() {
      if (completed) return
      completed = true
      clearTimeout(timer)

      const enriched = sortAndEnrichCandidates(collected, query)
      const finalCandidates = enriched.slice(0, maxResults)
      const finalResults = finalCandidates.map((c) => c.path)
      const durationMs = Math.round(performance.now() - start)

      resolve({
        results: finalResults,
        candidates: finalCandidates,
        durationMs,
        timedOut,
        startPath,
        query,
        targetType,
        includeHidden,
      })
    }

    if (signal) {
      signal.addEventListener("abort", () => {
        killProc(p)
        finish()
      })
    }

    p.stdout?.on("data", (chunk: Buffer) => {
      if (signal?.aborted) {
        killProc(p)
        finish()
        return
      }

      remainder += chunk.toString("utf-8")
      const lines = remainder.split(/\r?\n/)
      remainder = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        if (
          trimmed.startsWith("File Not Found") ||
          trimmed.includes("The system cannot find the path") ||
          trimmed.includes("The directory name is invalid") ||
          trimmed.includes("No such file or directory")
        ) {
          continue
        }
        collected.push(trimmed)
        if (collected.length >= Math.max(maxResults, maxResults * 2)) {
          killProc(p)
          break
        }
      }
    })

    p.on("close", () => {
      if (remainder.trim()) {
        const trimmed = remainder.trim()
        if (
          !trimmed.startsWith("File Not Found") &&
          !trimmed.includes("The system cannot find the path") &&
          !trimmed.includes("The directory name is invalid") &&
          !trimmed.includes("No such file or directory")
        ) {
          collected.push(trimmed)
        }
      }
      finish()
    })

    p.on("error", () => {
      finish()
    })
  })
}

export async function executeMultiTierScan(options: {
  query: string
  startPath?: string
  workspaceDir?: string
  includeHidden?: boolean
  targetType?: "file" | "folder" | "all"
  maxResults?: number
  timeoutMs?: number
}): Promise<ScanResult> {
  const start = performance.now()
  const {
    query,
    startPath,
    workspaceDir,
    includeHidden = true,
    targetType = "all",
    maxResults = 20,
    timeoutMs = 15000,
  } = options

  // 1. Recency intent detection (e.g. "latest folder", "recently downloaded")
  if (isRecencyQuery(query)) {
    const recencyIntent = parseRecencyIntent(query, targetType)
    const tier1Dirs = getTier1Directories(workspaceDir)
    const targetDirs = recencyIntent.preferredDir ? [recencyIntent.preferredDir] : tier1Dirs

    const recentCandidates = getRecentCandidates(targetDirs, recencyIntent.targetType, Math.min(maxResults, 5))
    const durationMs = Math.round(performance.now() - start)

    return {
      results: recentCandidates.map((item) => item.path),
      candidates: recentCandidates,
      durationMs,
      timedOut: false,
      startPath: targetDirs[0] || (process.env.USERPROFILE || "C:\\Users\\sahil"),
      query,
      targetType: recencyIntent.targetType,
      includeHidden,
      recencyQuery: true,
    }
  }

  // 2. Specific small directory provided directly -> scan directly
  if (!isBroadSearch(startPath)) {
    return executeScan({
      startPath: startPath!,
      query,
      includeHidden,
      targetType,
      maxResults,
      timeoutMs,
    })
  }

  // 3. TIER 1: Fast Priority Scan in common user directories
  const tier1Dirs = getTier1Directories(workspaceDir)
  const tier1Controller = new AbortController()
  const tier1Results: string[] = []

  const tier1Promises = tier1Dirs.map(async (dir) => {
    const scan = await executeScan({
      startPath: dir,
      query,
      includeHidden,
      targetType,
      maxResults,
      timeoutMs: 2500,
      signal: tier1Controller.signal,
    })
    if (scan.results.length > 0) {
      tier1Results.push(...scan.results)
      tier1Controller.abort()
    }
    return scan.results
  })

  await Promise.all(tier1Promises)

  const dedupedTier1 = Array.from(new Set(tier1Results))
  if (dedupedTier1.length > 0) {
    const enriched = sortAndEnrichCandidates(dedupedTier1, query)
    const finalCandidates = enriched.slice(0, maxResults)
    return {
      results: finalCandidates.map((c) => c.path),
      candidates: finalCandidates,
      durationMs: Math.round(performance.now() - start),
      timedOut: false,
      startPath: "User Priority Directories (Downloads, Desktop, Documents, Workspace)",
      query,
      targetType,
      includeHidden,
    }
  }

  // 4. TIER 2: Broad User Space Scan (only if Tier 1 yielded 0 results)
  const tier2Dirs = getTier2Directories()
  const tier2Controller = new AbortController()
  const tier2Results: string[] = []

  const tier2Promises = tier2Dirs.map(async (dir) => {
    const scan = await executeScan({
      startPath: dir,
      query,
      includeHidden,
      targetType,
      maxResults,
      timeoutMs: 3000,
      signal: tier2Controller.signal,
    })
    if (scan.results.length > 0) {
      tier2Results.push(...scan.results)
      tier2Controller.abort()
    }
    return scan.results
  })

  await Promise.all(tier2Promises)

  const dedupedTier2 = Array.from(new Set(tier2Results))
  if (dedupedTier2.length > 0) {
    const enriched = sortAndEnrichCandidates(dedupedTier2, query)
    const finalCandidates = enriched.slice(0, maxResults)
    return {
      results: finalCandidates.map((c) => c.path),
      candidates: finalCandidates,
      durationMs: Math.round(performance.now() - start),
      timedOut: false,
      startPath: "User Profile Space (Excluding Temp Cache)",
      query,
      targetType,
      includeHidden,
    }
  }

  // 4b. User profile entity fallback (e.g. "sahil hande" matches user profile C:\Users\sahil)
  const userProfile = process.env.USERPROFILE || "C:\\Users\\sahil"
  const userName = (process.env.USERNAME || path.basename(userProfile)).toLowerCase()
  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (queryTokens.some((t) => t.length >= 3 && (userName.includes(t) || t === userName))) {
    if (fs.existsSync(userProfile)) {
      const enriched = sortAndEnrichCandidates([userProfile], query)
      return {
        results: [userProfile],
        candidates: enriched,
        durationMs: Math.round(performance.now() - start),
        timedOut: false,
        startPath: "User Profile Directory",
        query,
        targetType,
        includeHidden,
      }
    }
  }

  // 5. TIER 3: Bounded drive root scan if user explicitly provided a drive root (e.g. C:\)
  if (startPath && /^[a-z]:\/?$/i.test(startPath.trim())) {
    return executeScan({
      startPath: startPath.trim(),
      query,
      includeHidden,
      targetType,
      maxResults,
      timeoutMs: 4000,
    })
  }

  return {
    results: [],
    candidates: [],
    durationMs: Math.round(performance.now() - start),
    timedOut: false,
    startPath: startPath || (process.env.USERPROFILE || "C:\\Users\\sahil"),
    query,
    targetType,
    includeHidden,
  }
}

export const HideAndSeekTool = Tool.define(
  "hide_and_seek",
  Effect.gen(function* () {
    return {
      description:
        "Ultra-fast filesystem scanner to locate files, folders, and hidden items across project roots or full drives on Windows. Supports any file extension (.cfg, .ini, .log, .json, etc.), resolves duplicate name collisions by ranking the latest modified file first, and handles natural recency queries like 'latest folder' or 'recently downloaded'.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const ins = yield* InstanceState.context.pipe(Effect.catch(() => Effect.succeed(undefined)))
          const workspaceDir = ins?.directory || process.cwd()

          const targetType = params.target_type ?? "all"
          const includeHidden = params.include_hidden ?? true
          const maxResults = params.max_results ?? 20

          const scan = yield* Effect.promise(() =>
            executeMultiTierScan({
              query: params.query,
              startPath: params.start_path?.trim(),
              workspaceDir,
              includeHidden,
              targetType,
              maxResults,
            }),
          )

          if (scan.error) {
            return {
              title: `Search Error: ${params.query}`,
              metadata: {
                query: params.query,
                start_path: scan.startPath,
                error: scan.error,
              },
              output: `Error scanning filesystem: ${scan.error}`,
            }
          }

          const count = scan.candidates.length
          const title = count > 0
            ? `Found ${count} item(s) (${scan.durationMs}ms)`
            : `No items found (${scan.durationMs}ms)`

          let output = ""
          if (count === 0) {
            output = `No items matching "${params.query}" found in "${scan.startPath}" (scanned in ${scan.durationMs}ms${
              scan.timedOut ? ", reached timeout" : ""
            }).`
          } else if (count === 1) {
            const item = scan.candidates[0]
            output = [
              `Found 1 item matching "${params.query}" in ${scan.durationMs}ms (scanned from: ${scan.startPath}):`,
              `1. [${item.isDir ? "Folder" : "File"}] ${item.path} (Modified: ${item.modified}, Size: ${item.formattedSize})`,
            ].join("\n")
          } else {
            // Multiple candidates exist: handle duplicate name collision gracefully
            const rows = scan.candidates.map((c, i) => {
              const tag = i === 0 ? "[LATEST] " : ""
              return `${i + 1}. ${tag}[${c.isDir ? "Folder" : "File"}] ${c.path} (Modified: ${c.modified}, Size: ${c.formattedSize})`
            })

            output = [
              `Found multiple matches (${count} candidates found in ${scan.durationMs}ms):`,
              ...rows,
              ``,
              `Defaulting to latest or specify exact index/path.`,
            ].join("\n")
          }

          return {
            title,
            metadata: {
              query: params.query,
              start_path: scan.startPath,
              count,
              duration_ms: scan.durationMs,
              target_type: scan.targetType,
              include_hidden: includeHidden,
              timed_out: scan.timedOut,
              results: scan.results,
              candidates: scan.candidates,
            },
            output,
          }
        }),
    }
  }),
)
