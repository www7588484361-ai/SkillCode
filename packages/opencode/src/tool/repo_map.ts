import path from "node:path"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import { FSUtil } from "@spacecode/core/fs-util"
import { extractTags, rankTags, renderRepoMap } from "../repomap"

export const Parameters = Schema.Struct({
  max_tokens: Schema.optional(Schema.Number).annotate({
    description: "Maximum approximate tokens for the generated structural repository map (defaults to 1024).",
  }),
  focus_files: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Optional list of active or important files to prioritize in the PageRank personalization vector.",
  }),
  search_path: Schema.optional(Schema.String).annotate({
    description: "Subdirectory or workspace path to map (defaults to workspace root).",
  }),
})

export const RepoMapTool = Tool.define(
  "repo_map",
  Effect.gen(function* () {
    const afs = yield* FSUtil.Service

    return {
      description:
        "Generate a condensed structural AST repository map of the workspace (classes, functions, interfaces, signatures, and cross-file dependencies ranked via Tree-sitter & PageRank). Use this to understand code architecture and relationships without reading raw files.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const rootDir = params.search_path
            ? path.isAbsolute(params.search_path)
              ? params.search_path
              : path.join(instance.directory, params.search_path)
            : instance.directory

          const maxTokens = params.max_tokens ?? 1024

          // Scan files using fs glob
          const files = yield* afs
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

          const selectedFiles = files.slice(0, 150)
          const tagsByFile = new Map()
          const fileContents = new Map()

          for (const file of selectedFiles) {
            const absPath = path.isAbsolute(file) ? file : path.join(rootDir, file)
            const relPath = path.isAbsolute(file) ? path.relative(rootDir, file) : file
            const content = yield* afs.readFileStringSafe(absPath).pipe(Effect.catch(() => Effect.succeed(undefined)))
            if (!content || content.length > 500_000) continue

            fileContents.set(relPath, content)
            const tags = extractTags(content, absPath, relPath)
            if (tags.length > 0) {
              tagsByFile.set(relPath, tags)
            }
          }

          const ranked = rankTags(tagsByFile, {
            chatFiles: params.focus_files ?? [],
            otherFiles: selectedFiles,
          })

          const mapText = renderRepoMap(ranked, { maxTokens, fileContents })

          return {
            metadata: {
              filesCount: selectedFiles.length,
              tagsCount: ranked.length,
              maxTokens,
            },
            title: `Repository Map (${selectedFiles.length} files)`,
            output: mapText || "No source code symbols found in the target directory.",
          }
        }),
    }
  }),
)
