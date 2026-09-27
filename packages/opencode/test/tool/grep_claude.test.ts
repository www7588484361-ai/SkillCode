import { describe, expect } from "bun:test"
import path from "path"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import { Effect } from "effect"
import { GrepTool } from "../../src/tool/grep"
import { TestInstance } from "../fixture/fixture"
import { SessionID, MessageID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@spacecode/core/cross-spawn-spawner"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { Ripgrep } from "@spacecode/core/ripgrep"
import { FSUtil } from "@spacecode/core/fs-util"
import { testEffect } from "../lib/effect"
import { Git } from "@/git"

const toolLayer = () =>
  LayerNode.compile(
    LayerNode.group([CrossSpawnSpawner.node, FSUtil.node, Ripgrep.node, Truncate.node, Agent.node, Git.node]),
  )

const it = testEffect(toolLayer())

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

describe("tool.grep (Claude Code superpowers)", () => {
  it.instance("output_mode: files_with_matches returns only matching file paths", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() =>
        Promise.all([
          Bun.write(path.join(test.directory, "a.txt"), "hello world\nmatch here"),
          Bun.write(path.join(test.directory, "b.txt"), "another match here\nand here"),
          Bun.write(path.join(test.directory, "c.txt"), "no target string here"),
        ]),
      )
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        {
          pattern: "match",
          path: test.directory,
          output_mode: "files_with_matches",
        },
        ctx,
      )

      expect(result.metadata.matches).toBe(2)
      expect(result.output).toContain("a.txt")
      expect(result.output).toContain("b.txt")
      expect(result.output).not.toContain("c.txt")
      expect(result.output).not.toContain("Line ")
    }),
  )

  it.instance("output_mode: count returns match frequencies per file", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() =>
        Promise.all([
          Bun.write(path.join(test.directory, "one.txt"), "target\ntarget\ntarget"),
          Bun.write(path.join(test.directory, "two.txt"), "target\nsomething else"),
        ]),
      )
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        {
          pattern: "target",
          path: test.directory,
          output_mode: "count",
        },
        ctx,
      )

      expect(result.metadata.matches).toBe(4)
      expect(result.output).toContain("one.txt: 3")
      expect(result.output).toContain("two.txt: 1")
    }),
  )

  it.instance("supports context lines (-A, -B, -C)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "context.txt")
      yield* Effect.promise(() =>
        Bun.write(file, "line1\nline2\nTARGET_LINE\nline4\nline5"),
      )
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        {
          pattern: "TARGET_LINE",
          path: file,
          "-B": 1,
          "-A": 1,
        },
        ctx,
      )

      expect(result.metadata.matches).toBe(1)
      expect(result.output).toContain("2- line2")
      expect(result.output).toContain("3: TARGET_LINE")
      expect(result.output).toContain("4- line4")
    }),
  )

  it.instance("supports case-insensitive search (-i)", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "case.txt")
      yield* Effect.promise(() => Bun.write(file, "UPPERCASE_WORD\nlowercase_word"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        {
          pattern: "uppercase_word",
          path: file,
          "-i": true,
        },
        ctx,
      )

      expect(result.metadata.matches).toBe(1)
      expect(result.output).toContain("UPPERCASE_WORD")
    }),
  )

  it.instance("supports pagination with head_limit and offset", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "paging.txt")
      yield* Effect.promise(() =>
        Bun.write(
          file,
          "item 1\nitem 2\nitem 3\nitem 4\nitem 5\nitem 6\nitem 7\nitem 8\nitem 9\nitem 10",
        ),
      )
      const info = yield* GrepTool
      const grep = yield* info.init()

      const pagedResult = yield* grep.execute(
        {
          pattern: "item",
          path: file,
          head_limit: 3,
          offset: 2,
        },
        ctx,
      )

      expect(pagedResult.metadata.matches).toBeGreaterThan(0)
      expect(pagedResult.metadata.truncated).toBe(true)
      expect(pagedResult.output).toContain("Line 3: item 3")
      expect(pagedResult.output).toContain("Line 4: item 4")
      expect(pagedResult.output).toContain("Line 5: item 5")
      expect(pagedResult.output).not.toContain("Line 1: item 1")
      expect(pagedResult.output).not.toContain("Line 2: item 2")
      expect(pagedResult.output).not.toContain("Line 6: item 6")
    }),
  )
})
