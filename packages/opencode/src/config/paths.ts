export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@spacecode/core/flag/flag"
import { Global } from "@spacecode/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@spacecode/core/fs-util"

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string,
  directory: string,
  worktree?: string,
) {
  const afs = yield* FSUtil.Service
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* FSUtil.Service
  return unique([
    Global.Path.config,
    ...(!Flag.SPACECODE_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          // SkillCode rebrand: discover new dirs first, legacy dirs as fallback.
          targets: [".skillcode", ".spacecode", ".opencode"],
          start: directory,
          stop: worktree,
        })
      : []),
    ...(yield* afs.up({
      targets: [".skillcode", ".spacecode", ".opencode"],
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(Flag.SPACECODE_CONFIG_DIR ? [Flag.SPACECODE_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}
