import { $ } from "bun"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { Git } from "../../src/git"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const weird = process.platform === "win32" ? "space file.txt" : "tab\tfile.txt"
const it = testEffect(LayerNode.compile(LayerNode.group([Git.node])))

const scopedTmpdir = (options?: Parameters<typeof tmpdir>[0]) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir(options)),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

describe("Git", () => {
  it.live("branch() returns current branch name", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      const git = yield* Git.Service
      const branch = yield* git.branch(tmp.path)
      expect(branch).toBeDefined()
      expect(typeof branch).toBe("string")
    }),
  )

  it.live("branch() returns undefined for non-git directories", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir()
      const git = yield* Git.Service
      const branch = yield* git.branch(tmp.path)
      expect(branch).toBeUndefined()
    }),
  )

  it.live("branch() returns undefined for detached HEAD", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      const hash = (yield* Effect.promise(() => $`git rev-parse HEAD`.cwd(tmp.path).quiet().text())).trim()
      yield* Effect.promise(() => $`git checkout --detach ${hash}`.cwd(tmp.path).quiet())
      const git = yield* Git.Service
      const branch = yield* git.branch(tmp.path)
      expect(branch).toBeUndefined()
    }),
  )

  it.live("defaultBranch() uses init.defaultBranch when available", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      yield* Effect.promise(() => $`git branch -M trunk`.cwd(tmp.path).quiet())
      yield* Effect.promise(() => $`git config init.defaultBranch trunk`.cwd(tmp.path).quiet())
      const git = yield* Git.Service
      const branch = yield* git.defaultBranch(tmp.path)
      expect(branch?.name).toBe("trunk")
      expect(branch?.ref).toBe("trunk")
    }),
  )

  it.live("status() handles special filenames", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, weird), "hello\n", "utf-8"))
      const git = yield* Git.Service
      const status = yield* git.status(tmp.path)
      expect(status).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: weird,
            status: "added",
          }),
        ]),
      )
    }),
  )

  it.live("diff(), stats(), and mergeBase() parse tracked changes", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      yield* Effect.promise(() => $`git branch -M main`.cwd(tmp.path).quiet())
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, weird), "before\n", "utf-8"))
      yield* Effect.promise(() => $`git add .`.cwd(tmp.path).quiet())
      yield* Effect.promise(() => $`git commit --no-gpg-sign -m "add file"`.cwd(tmp.path).quiet())
      yield* Effect.promise(() => $`git checkout -b feature/test`.cwd(tmp.path).quiet())
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, weird), "after\n", "utf-8"))

      const git = yield* Git.Service
      const [base, diff, stats] = yield* Effect.all([
        git.mergeBase(tmp.path, "main"),
        git.diff(tmp.path, "HEAD"),
        git.stats(tmp.path, "HEAD"),
      ])

      expect(base).toBeTruthy()
      expect(diff).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: weird,
            status: "modified",
          }),
        ]),
      )
      expect(stats).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: weird,
            additions: 1,
            deletions: 1,
          }),
        ]),
      )
    }),
  )

  it.live("patch() returns capped native patch output", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, weird), "before\n", "utf-8"))
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "other.txt"), "old\n", "utf-8"))
      yield* Effect.promise(() => $`git add .`.cwd(tmp.path).quiet())
      yield* Effect.promise(() => $`git commit --no-gpg-sign -m "add file"`.cwd(tmp.path).quiet())
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, weird), "after\n", "utf-8"))
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "other.txt"), "new\n", "utf-8"))

      const git = yield* Git.Service
      const [patch, all, capped] = yield* Effect.all([
        git.patch(tmp.path, "HEAD", weird, { context: 2_147_483_647 }),
        git.patchAll(tmp.path, "HEAD", { context: 2_147_483_647 }),
        git.patch(tmp.path, "HEAD", weird, { maxOutputBytes: 1 }),
      ])

      expect(patch.truncated).toBe(false)
      expect(patch.text).toContain("diff --git")
      expect(patch.text).toContain("-before")
      expect(patch.text).toContain("+after")
      expect(all.truncated).toBe(false)
      expect(all.text).toContain("diff --git")
      expect(all.text).toContain("other.txt")
      expect(all.text).toContain("+new")
      expect(capped.truncated).toBe(true)
      expect(capped.text).toBe("")
    }),
  )

  it.live("patchUntracked() and statUntracked() handle added files", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, weird), "one\ntwo\n", "utf-8"))

      const git = yield* Git.Service
      const [patch, stat] = yield* Effect.all([
        git.patchUntracked(tmp.path, weird, { context: 2_147_483_647 }),
        git.statUntracked(tmp.path, weird),
      ])

      expect(patch.truncated).toBe(false)
      expect(patch.text).toContain("diff --git")
      expect(patch.text).toContain("+one")
      expect(patch.text).toContain("+two")
      expect(stat).toEqual(expect.objectContaining({ file: weird, additions: 2, deletions: 0 }))
    }),
  )

  it.live("show() returns empty text for binary blobs", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "bin.dat"), new Uint8Array([0, 1, 2, 3])))
      yield* Effect.promise(() => $`git add .`.cwd(tmp.path).quiet())
      yield* Effect.promise(() => $`git commit --no-gpg-sign -m "add binary"`.cwd(tmp.path).quiet())

      const git = yield* Git.Service
      const text = yield* git.show(tmp.path, "HEAD", "bin.dat")
      expect(text).toBe("")
    }),
  )

  it.live("commit() and getHeadCommit() record commit with attribution trailer", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      const git = yield* Git.Service

      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "feature.txt"), "hello world\n", "utf-8"))
      const commitRes = yield* git.commit(tmp.path, {
        message: "feat: add feature file",
        model: "claude-3-7-sonnet",
      })

      expect(commitRes.exitCode).toBe(0)
      expect(commitRes.hash).toBeDefined()

      const head = yield* git.getHeadCommit(tmp.path)
      expect(head).toBeDefined()
      expect(head?.hash).toBe(commitRes.hash!)
      expect(head?.message).toContain("feat: add feature file")
    }),
  )

  it.live("undo() reverts the last commit and restores files safely", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      const git = yield* Git.Service

      // Baseline commit
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "file1.txt"), "original file1\n", "utf-8"))
      const baseCommit = yield* git.commit(tmp.path, { message: "chore: base commit" })
      expect(baseCommit.exitCode).toBe(0)

      // Commit 2: modify file1, add file2
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "file1.txt"), "modified file1\n", "utf-8"))
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "file2.txt"), "new file2\n", "utf-8"))
      const commit2 = yield* git.commit(tmp.path, { message: "feat: second commit", model: "gpt-4o" })
      expect(commit2.exitCode).toBe(0)

      // Verify files before undo
      const f1Before = yield* Effect.promise(() => fs.readFile(path.join(tmp.path, "file1.txt"), "utf-8"))
      expect(f1Before).toBe("modified file1\n")

      // Perform undo
      const undoRes = yield* git.undo(tmp.path)
      expect(undoRes.undoneCommitHash).toBe(commit2.hash!)
      expect(undoRes.currentHeadHash).toBe(baseCommit.hash!)
      expect(undoRes.restoredFiles).toEqual(expect.arrayContaining(["file1.txt", "file2.txt"]))

      // Verify file1 reverted
      const f1After = yield* Effect.promise(() => fs.readFile(path.join(tmp.path, "file1.txt"), "utf-8"))
      expect(f1After).toBe("original file1\n")

      // Verify file2 removed
      const f2Exists = yield* Effect.promise(async () => {
        try {
          await fs.access(path.join(tmp.path, "file2.txt"))
          return true
        } catch {
          return false
        }
      })
      expect(f2Exists).toBe(false)

      // Verify git status is clean
      const status = yield* git.status(tmp.path)
      expect(status).toHaveLength(0)
    }),
  )

  it.live("undo() aborts if uncommitted changes exist in affected files", () =>
    Effect.gen(function* () {
      const tmp = yield* scopedTmpdir({ git: true })
      const git = yield* Git.Service

      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "file.txt"), "v1\n", "utf-8"))
      yield* git.commit(tmp.path, { message: "v1" })

      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "file.txt"), "v2\n", "utf-8"))
      yield* git.commit(tmp.path, { message: "v2" })

      // Create an uncommitted change
      yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "file.txt"), "dirty uncommitted\n", "utf-8"))

      let errorMessage = ""
      yield* git.undo(tmp.path).pipe(
        Effect.catch((err: any) => {
          errorMessage = err?.message ?? String(err)
          return Effect.void
        }),
      )
      expect(errorMessage).toContain("uncommitted changes")
    }),
  )
})
