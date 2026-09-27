import path from "node:path"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { InstanceState } from "@/effect/instance-state"
import { sliceFileDependencies } from "../repomap/slice"

export const Parameters = Schema.Struct({
  file_path: Schema.String.annotate({
    description: "The path to the source file to extract dependency contracts and imported symbol signatures for.",
  }),
})

export const SymbolSliceTool = Tool.define(
  "symbol_slice",
  Effect.gen(function* () {
    return {
      description:
        "Extract cross-file dependency and symbol contracts for a target file. Traces all imported modules, resolves workspace dependencies, and extracts the exact type definitions, interfaces, classes, and function signatures of the imported symbols without loading entire files.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "symbol_slice",
            patterns: [params.file_path],
            always: ["*"],
            metadata: { file_path: params.file_path },
          })

          const instance = yield* InstanceState.context
          const targetPath = path.isAbsolute(params.file_path)
            ? params.file_path
            : path.resolve(instance.directory, params.file_path)

          const worktree = instance.worktree && instance.worktree !== "/" ? instance.worktree : instance.directory

          try {
            const result = sliceFileDependencies(targetPath, worktree)
            return {
              title: `Symbol slice: ${path.basename(targetPath)} (${result.totalSymbols} symbols)`,
              metadata: {
                targetFile: result.targetFile,
                totalSymbols: result.totalSymbols,
                totalDependencies: result.totalDependencies,
              },
              output: result.rendered,
            }
          } catch (error) {
            return {
              title: `Symbol slice failed for ${path.basename(targetPath)}`,
              metadata: { error: String(error) },
              output: `Failed to extract symbol slice: ${error instanceof Error ? error.message : String(error)}`,
            }
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters>
  }),
)
