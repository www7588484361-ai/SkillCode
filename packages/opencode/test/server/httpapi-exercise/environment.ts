import { Flag } from "@spacecode/core/flag/flag"
import { Effect } from "effect"
import path from "path"

const preserveExerciseGlobalRoot = !!(process.env.SPACECODE_HTTPAPI_EXERCISE_GLOBAL ?? process.env.OPENCODE_HTTPAPI_EXERCISE_GLOBAL)
export const exerciseGlobalRoot =
  (process.env.SPACECODE_HTTPAPI_EXERCISE_GLOBAL ?? process.env.OPENCODE_HTTPAPI_EXERCISE_GLOBAL) ??
  path.join(process.env.TMPDIR ?? "/tmp", `spacecode-httpapi-global-${process.pid}`)
process.env.XDG_DATA_HOME = path.join(exerciseGlobalRoot, "data")
process.env.XDG_CONFIG_HOME = path.join(exerciseGlobalRoot, "config")
process.env.XDG_STATE_HOME = path.join(exerciseGlobalRoot, "state")
process.env.XDG_CACHE_HOME = path.join(exerciseGlobalRoot, "cache")
process.env.OPENCODE_DISABLE_SHARE = "true"
export const exerciseConfigDirectory = path.join(exerciseGlobalRoot, "config", "spacecode")
export const exerciseDataDirectory = path.join(exerciseGlobalRoot, "data", "spacecode")

const preserveExerciseDatabase = !!(process.env.SPACECODE_HTTPAPI_EXERCISE_DB ?? process.env.OPENCODE_HTTPAPI_EXERCISE_DB)
export const exerciseDatabasePath =
  (process.env.SPACECODE_HTTPAPI_EXERCISE_DB ?? process.env.OPENCODE_HTTPAPI_EXERCISE_DB) ??
  path.join(process.env.TMPDIR ?? "/tmp", `spacecode-httpapi-exercise-${process.pid}.db`)
process.env.OPENCODE_DB = exerciseDatabasePath
Flag.SPACECODE_DB = exerciseDatabasePath

export const original = {
  SPACECODE_SERVER_PASSWORD: Flag.SPACECODE_SERVER_PASSWORD,
  SPACECODE_SERVER_USERNAME: Flag.SPACECODE_SERVER_USERNAME,
}

export const cleanupExercisePaths = Effect.promise(async () => {
  const fs = await import("fs/promises")
  if (!preserveExerciseDatabase) {
    await Promise.all(
      [exerciseDatabasePath, `${exerciseDatabasePath}-wal`, `${exerciseDatabasePath}-shm`].map((file) =>
        fs.rm(file, { force: true }).catch(() => undefined),
      ),
    )
  }
  if (!preserveExerciseGlobalRoot)
    await fs.rm(exerciseGlobalRoot, { recursive: true, force: true }).catch(() => undefined)
})
