import path from "path"
import fs from "fs"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@spacecode/core/fs-util"
import { Ripgrep } from "@spacecode/core/ripgrep"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./grep.txt"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({
    description: "The regex pattern to search for in file contents",
  }),
  path: Schema.optional(Schema.String).annotate({
    description: "The directory or file to search in. Defaults to the current working directory.",
  }),
  include: Schema.optional(Schema.String).annotate({
    description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob',
  }),
  glob: Schema.optional(Schema.String).annotate({
    description: 'Alias for include (e.g. "*.js", "*.{ts,tsx}")',
  }),
  output_mode: Schema.optional(
    Schema.Literals(["files_with_matches", "content", "count"]),
  ).annotate({
    description:
      'Output mode: "files_with_matches" shows matching file paths (recommended, saves 90% tokens), "content" shows matching lines with line numbers, "count" shows match counts per file. Defaults to "content".',
  }),
  "-B": Schema.optional(Schema.Number).annotate({
    description: 'Number of lines to show before each match (rg -B). Requires output_mode: "content".',
  }),
  "-A": Schema.optional(Schema.Number).annotate({
    description: 'Number of lines to show after each match (rg -A). Requires output_mode: "content".',
  }),
  "-C": Schema.optional(Schema.Number).annotate({
    description: 'Number of lines to show before and after each match (rg -C / context). Requires output_mode: "content".',
  }),
  context: Schema.optional(Schema.Number).annotate({
    description: 'Alias for -C. Requires output_mode: "content".',
  }),
  "-n": Schema.optional(Schema.Boolean).annotate({
    description: 'Show line numbers in output (rg -n). Requires output_mode: "content". Defaults to true.',
  }),
  "-i": Schema.optional(Schema.Boolean).annotate({
    description: "Case-insensitive search (rg -i). Defaults to false.",
  }),
  head_limit: Schema.optional(Schema.Number).annotate({
    description:
      "Limit output to first N entries. Defaults to 250 when unspecified. Pass 0 for unlimited.",
  }),
  offset: Schema.optional(Schema.Number).annotate({
    description: "Skip first N entries before applying head_limit. Defaults to 0.",
  }),
  multiline: Schema.optional(Schema.Boolean).annotate({
    description: "Enable multiline mode where . matches newlines and patterns span lines.",
  }),
})

export const GrepTool = Tool.define(
  "grep",
  Effect.gen(function* () {
    const fsService = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (
        params: Schema.Schema.Type<typeof Parameters>,
        ctx: Tool.Context,
      ) =>
        Effect.gen(function* () {
          const empty = {
            title: params.pattern,
            metadata: { matches: 0, truncated: false },
            output: "No files found",
          }
          if (!params.pattern) {
            throw new Error("pattern is required")
          }

          const includePattern = params.include ?? params.glob

          yield* ctx.ask({
            permission: "grep",
            patterns: [params.pattern],
            always: ["*"],
            metadata: {
              pattern: params.pattern,
              path: params.path,
              include: includePattern,
            },
          })

          const ins = yield* InstanceState.context
          const requested = path.isAbsolute(params.path ?? ins.directory)
            ? (params.path ?? ins.directory)
            : path.join(ins.directory, params.path ?? ".")
          const requestedInfo = yield* fsService
            .stat(requested)
            .pipe(Effect.catch(() => Effect.succeed(undefined)))
          yield* assertExternalDirectoryEffect(ctx, requested, {
            bypass: false,
            kind: requestedInfo?.type === "Directory" ? "directory" : "file",
          })

          const search = FSUtil.resolve(requested)
          const info = yield* fsService.stat(search).pipe(Effect.catch(() => Effect.succeed(undefined)))
          const cwd = info?.type === "Directory" ? search : path.dirname(search)
          const fileFilter = info?.type === "Directory" ? undefined : path.basename(search)

          const headLimit = params.head_limit === 0 ? Infinity : (params.head_limit ?? 250)
          const offset = params.offset ?? 0

          // Query ripgrep
          const result = yield* ripgrep.grep({
            cwd,
            pattern: params.pattern,
            include: includePattern,
            file: fileFilter,
            limit: Math.min(10000, offset + (headLimit === Infinity ? 1000 : headLimit) + 1),
            caseInsensitive: params["-i"] ?? false,
            multiline: params.multiline ?? false,
          })

          if (result.length === 0) return empty

          // Resolve full file paths
          const resolvedMatches = result.map((item) => ({
            fullPath: path.resolve(
              requestedInfo?.type === "Directory" ? requested : path.dirname(requested),
              item.entry.path,
            ),
            line: item.line,
            text: item.text,
          }))

          const mode = params.output_mode ?? "content"

          // --- MODE 1: files_with_matches ---
          if (mode === "files_with_matches") {
            const uniqueFiles = Array.from(new Set(resolvedMatches.map((m) => m.fullPath)))
            const totalFiles = uniqueFiles.length
            const sliced = uniqueFiles.slice(offset, offset + headLimit)
            const truncated = offset + headLimit < totalFiles

            // Relativize under worktree or cwd
            const baseDir = ins.worktree && ins.worktree !== "/" ? ins.worktree : ins.directory
            const formattedPaths = sliced.map((fp) => {
              const rel = path.relative(baseDir, fp).replaceAll("\\", "/")
              return rel.startsWith("..") ? fp : rel
            })

            const lines = [`Found ${totalFiles} matching ${totalFiles === 1 ? "file" : "files"}:`, ...formattedPaths]
            if (truncated) {
              lines.push("")
              lines.push(
                `(Results truncated: showing first ${sliced.length} of ${totalFiles} files. Consider using head_limit / offset.)`,
              )
            }

            return {
              title: params.pattern,
              metadata: {
                matches: totalFiles,
                truncated,
              },
              output: lines.join("\n"),
            }
          }

          // --- MODE 2: count ---
          if (mode === "count") {
            const counts = new Map<string, number>()
            for (const m of resolvedMatches) {
              counts.set(m.fullPath, (counts.get(m.fullPath) ?? 0) + 1)
            }
            const entries = Array.from(counts.entries())
            const totalCount = resolvedMatches.length
            const sliced = entries.slice(offset, offset + headLimit)
            const truncated = offset + headLimit < entries.length

            const baseDir = ins.worktree && ins.worktree !== "/" ? ins.worktree : ins.directory
            const formatted = sliced.map(([fp, cnt]) => {
              const rel = path.relative(baseDir, fp).replaceAll("\\", "/")
              const display = rel.startsWith("..") ? fp : rel
              return `${display}: ${cnt}`
            })

            const lines = [`Found ${totalCount} matches across ${entries.length} files:`, ...formatted]
            if (truncated) {
              lines.push("")
              lines.push(`(Results truncated: showing first ${sliced.length} entries.)`)
            }

            return {
              title: params.pattern,
              metadata: {
                matches: totalCount,
                truncated,
              },
              output: lines.join("\n"),
            }
          }

          // --- MODE 3: content (default) ---
          const beforeCount = params["-B"] ?? params["-C"] ?? params.context ?? 0
          const afterCount = params["-A"] ?? params["-C"] ?? params.context ?? 0
          const showLineNumbers = params["-n"] ?? true

          // File lines cache for context lines
          const fileLinesCache = new Map<string, string[]>()
          const getLines = (fp: string): string[] | undefined => {
            if (fileLinesCache.has(fp)) return fileLinesCache.get(fp)
            try {
              const raw = fs.readFileSync(fp, "utf-8")
              const split = raw.split(/\r?\n/)
              fileLinesCache.set(fp, split)
              return split
            } catch {
              return undefined
            }
          }

          const slicedMatches = resolvedMatches.slice(offset, offset + headLimit)
          const truncated = offset + headLimit < resolvedMatches.length || resolvedMatches.length >= 100

          const output = [`Found ${resolvedMatches.length} matches${truncated ? " (more matches available)" : ""}`]

          let currentPath = ""
          for (const match of slicedMatches) {
            const displayPath = match.fullPath
            if (currentPath !== displayPath) {
              if (currentPath !== "") output.push("")
              currentPath = displayPath
              output.push(`${displayPath}:`)
            }

            if (beforeCount > 0 || afterCount > 0) {
              const allLines = getLines(match.fullPath)
              if (allLines) {
                const startLine = Math.max(1, match.line - beforeCount)
                const endLine = Math.min(allLines.length, match.line + afterCount)
                for (let l = startLine; l <= endLine; l++) {
                  const prefix = showLineNumbers ? `  Line ${l}${l === match.line ? ":" : "-"} ` : "  "
                  output.push(`${prefix}${allLines[l - 1]}`)
                }
                continue
              }
            }

            const prefix = showLineNumbers ? `  Line ${match.line}: ` : "  "
            output.push(`${prefix}${match.text}`)
          }

          if (truncated) {
            output.push("")
            output.push("(Results truncated. Consider using a more specific path or pattern.)")
          }

          return {
            title: params.pattern,
            metadata: {
              matches: resolvedMatches.length,
              truncated,
            },
            output: output.join("\n"),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
