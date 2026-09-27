import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import { Effect } from "effect"
import { Git } from "../../src/git"
import { autoGitCheckpoint } from "../../src/git/checkpoint"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Git.node])))

const scopedTmpdir = (options?: Parameters<typeof tmpdir>[0]) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir(options)),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

describe("Auto Git Checkpointing After Edits", () => {
  it.live("automatically creates checkpoint commit when file is edited in git repo", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      const git = yield* Git.Service

      // Baseline file and commit
      const testFile = path.join(tmp.path, "app.ts")
      yield* Effect.promise(() => fs.writeFile(testFile, 'console.log("v1")\n', "utf-8"))
      const baseCommit = yield* git.commit(tmp.path, { message: "chore: init" })
      expect(baseCommit.exitCode).toBe(0)

      // Simulate file edit
      yield* Effect.promise(() => fs.writeFile(testFile, 'console.log("v2 - edited by agent")\n', "utf-8"))

      // Run autoGitCheckpoint
      const checkpointSha = autoGitCheckpoint({
        cwd: tmp.path,
        filePath: testFile,
        action: "edit",
        model: "assistant",
      })

      expect(checkpointSha).toBeDefined()
      expect(typeof checkpointSha).toBe("string")

      // Verify the HEAD commit
      const head = yield* git.getHeadCommit(tmp.path)
      expect(head).toBeDefined()
      expect(head?.hash).toBe(checkpointSha!)
      expect(head?.message).toContain("spacecode: edit app.ts")

      // Verify safe rollback via undo
      const undoRes = yield* git.undo(tmp.path)
      expect(undoRes.undoneCommitHash).toBe(checkpointSha!)
      expect(undoRes.currentHeadHash).toBe(baseCommit.hash!)

      // Verify file reverted to original v1 content
      const reverted = yield* Effect.promise(() => fs.readFile(testFile, "utf-8"))
      expect(reverted).toBe('console.log("v1")\n')

      // Verify status is clean
      const status = yield* git.status(tmp.path)
      expect(status).toHaveLength(0)
    }),
  )

  it.live("gracefully does nothing in non-git directories", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir()
      const testFile = path.join(tmp.path, "test.txt")
      yield* Effect.promise(() => fs.writeFile(testFile, "hello\n", "utf-8"))

      const result = autoGitCheckpoint({
        cwd: tmp.path,
        filePath: testFile,
        action: "edit",
      })

      expect(result).toBeUndefined()
    }),
  )
})
