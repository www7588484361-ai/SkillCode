import { Context, Effect, Layer } from "effect"
import path from "node:path"
import fsSync from "node:fs"
import { FSUtil } from "@spacecode/core/fs-util"
import { extractTags, type Tag } from "./tag"
import { rankTags, type RankedTag, type GraphOptions } from "./graph"
import { renderRepoMap, type RenderOptions } from "./renderer"

export { type Tag, extractTags } from "./tag"
export { rankTags, type RankedTag, type GraphOptions } from "./graph"
export { renderRepoMap, type RenderOptions } from "./renderer"

interface FileCacheEntry {
  mtimeMs: number
  size: number
  content: string
  tags: Tag[]
}

const fileCache = new Map<string, FileCacheEntry>()

export interface RepoMapOptions {
  readonly rootDir: string
  readonly maxTokens?: number
  readonly chatFiles?: string[]
  readonly otherFiles?: string[]
  readonly mentionedFiles?: string[]
  readonly mentionedIdents?: string[]
}

export interface Interface {
  readonly generate: (options: RepoMapOptions) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@spacecode/RepoMap") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service

    const generate = Effect.fn("RepoMap.generate")(function* (opts: RepoMapOptions) {
      const rootDir = opts.rootDir
      const maxTokens = opts.maxTokens ?? 1024

      let files = opts.otherFiles ?? []
      if (files.length === 0) {
        const globResult = yield* fs
          .glob("**/*", {
            cwd: rootDir,
            nodir: true,
            ignore: [
              "**/node_modules/**",
              "**/.git/**",
              "**/dist/**",
              "**/build/**",
              "**/.next/**",
              "**/.turbo/**",
              "**/bin/**",
              "**/*.log",
              "**/*.lock",
              "**/*.wasm",
              "**/*.exe",
              "**/*.png",
              "**/*.jpg",
              "**/*.jpeg",
            ],
          })
          .pipe(Effect.catch(() => Effect.succeed([])))
        files = globResult
      }

      // Limit scanning to top 200 files for performance
      const selectedFiles = files.slice(0, 200)

      const tagsByFile = new Map<string, Tag[]>()
      const fileContents = new Map<string, string>()

      for (const file of selectedFiles) {
        const absPath = path.isAbsolute(file) ? file : path.join(rootDir, file)
        const relPath = path.isAbsolute(file) ? path.relative(rootDir, file) : file

        try {
          const stat = fsSync.statSync(absPath, { throwIfNoEntry: false })
          if (!stat || !stat.isFile() || stat.size > 500_000) continue

          const cached = fileCache.get(absPath)
          if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
            fileContents.set(relPath, cached.content)
            if (cached.tags.length > 0) {
              tagsByFile.set(relPath, cached.tags)
            }
            continue
          }

          const content = yield* fs.readFileStringSafe(absPath).pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (!content) continue

          fileContents.set(relPath, content)
          const tags = extractTags(content, absPath, relPath)
          if (tags.length > 0) {
            tagsByFile.set(relPath, tags)
          }

          fileCache.set(absPath, {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            content,
            tags,
          })
        } catch {
          continue
        }
      }

      const ranked = rankTags(tagsByFile, {
        chatFiles: opts.chatFiles,
        otherFiles: selectedFiles,
        mentionedFiles: opts.mentionedFiles,
        mentionedIdents: opts.mentionedIdents,
      })

      return renderRepoMap(ranked, { maxTokens, fileContents })
    })

    return Service.of({ generate })
  }),
)
