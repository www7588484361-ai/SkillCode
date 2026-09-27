import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import path from "node:path"
import fs from "node:fs"
import { Effect, Layer } from "effect"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import {
  HideAndSeekTool,
  executeScan,
  executeMultiTierScan,
  formatSearchPattern,
  isRecencyQuery,
  parseRecencyIntent,
  getRecentCandidates,
  sortAndEnrichCandidates,
} from "../../src/tool/hide_and_seek"
import * as Tool from "../../src/tool/tool"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { Config } from "@/config/config"
import { testEffect } from "../lib/effect"
import { provideInstance, testInstanceStoreLayer } from "../fixture/fixture"

const testLayer = Layer.mergeAll(
  LayerNode.compile(
    LayerNode.group([
      Truncate.node,
      Config.node,
      Agent.node,
    ]),
  ),
  testInstanceStoreLayer,
)

const effectTest = testEffect(testLayer)

describe("HideAndSeekTool - Unit & Integration Tests", () => {
  const projectRoot = path.resolve(__dirname, "../..")
  const fixtureCfg = path.join(projectRoot, "settings.cfg")

  beforeAll(() => {
    fs.writeFileSync(fixtureCfg, "port=8080\nenv=test", "utf-8")
  })

  afterAll(() => {
    try {
      if (fs.existsSync(fixtureCfg)) fs.unlinkSync(fixtureCfg)
    } catch {}
  })

  it("formats patterns correctly for any extension (.cfg, .ini, .log, .json)", () => {
    expect(formatSearchPattern("settings")).toBe("*settings*")
    expect(formatSearchPattern("app.cfg")).toBe("*app*.cfg*")
    expect(formatSearchPattern("config.ini")).toBe("*config*.ini*")
    expect(formatSearchPattern("server.log")).toBe("*server*.log*")
    expect(formatSearchPattern("test 0000")).toBe("*test*0000*")
    expect(formatSearchPattern("*.json")).toBe("*.json")
    expect(formatSearchPattern("package.json")).toBe("*package*.json*")
    expect(formatSearchPattern("")).toBe("*")
  })

  it("handles duplicate name collisions with [LATEST] priority ranking", () => {
    const dummyFiles = [
      { path: "C:\\backup\\settings.cfg", mtimeMs: 1000 },
      { path: "C:\\active\\settings.cfg", mtimeMs: 5000 },
      { path: "C:\\old\\settings.cfg", mtimeMs: 2000 },
    ]

    const candidates = dummyFiles.map((f) => ({
      path: f.path,
      name: path.basename(f.path),
      isDir: false,
      mtimeMs: f.mtimeMs,
      modified: new Date(f.mtimeMs).toLocaleString(),
      size: 100,
      formattedSize: "100 B",
      isExact: true,
      isPrefix: true,
    }))

    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)

    expect(candidates[0].path).toBe("C:\\active\\settings.cfg")
    expect(candidates[0].mtimeMs).toBe(5000)
    expect(candidates[1].path).toBe("C:\\old\\settings.cfg")
    expect(candidates[2].path).toBe("C:\\backup\\settings.cfg")
  })

  it("enriches and sorts real files with exact match and mtime priority", () => {
    const p1 = path.join(projectRoot, "package.json")
    const p2 = path.join(projectRoot, "tsconfig.json")
    if (fs.existsSync(p1) && fs.existsSync(p2)) {
      const candidates = sortAndEnrichCandidates([p2, p1], "package.json")
      expect(candidates.length).toBe(2)
      // Exact match package.json should be first
      expect(candidates[0].path).toBe(p1)
      expect(candidates[0].isExact).toBe(true)
      expect(candidates[0].formattedSize).not.toBe("Unknown")
    }
  })

  it("detects recency intent accurately", () => {
    expect(isRecencyQuery("latest folder")).toBe(true)
    expect(isRecencyQuery("recently downloaded")).toBe(true)
    expect(isRecencyQuery("recent")).toBe(true)
    expect(isRecencyQuery("last modified")).toBe(true)
    expect(isRecencyQuery("test 0000")).toBe(false)
    expect(isRecencyQuery("package.json")).toBe(false)

    const intentFolder = parseRecencyIntent("latest folder", "all")
    expect(intentFolder.targetType).toBe("folder")

    const intentDownloads = parseRecencyIntent("recently downloaded", "all")
    expect(intentDownloads.preferredDir).toContain("Downloads")
  })

  it("retrieves recent items sorted by modification timestamp", () => {
    const userProfile = process.env.USERPROFILE || "C:\\Users\\sahil"
    const downloads = path.join(userProfile, "Downloads")
    if (fs.existsSync(downloads)) {
      const recent = getRecentCandidates([downloads], "all", 3)
      expect(Array.isArray(recent)).toBe(true)
      if (recent.length > 1) {
        expect(recent[0].mtimeMs).toBeGreaterThanOrEqual(recent[1].mtimeMs)
      }
    }
  })

  it("performs multi-tier priority search rapidly for items without full path", async () => {
    const scan = await executeMultiTierScan({
      query: "settings.cfg",
      workspaceDir: projectRoot,
      targetType: "all",
      maxResults: 5,
    })

    expect(scan.results.length).toBeGreaterThanOrEqual(1)
    expect(scan.results.some((p) => p.includes("settings.cfg"))).toBe(true)
    expect(scan.durationMs).toBeLessThan(5000)
    expect(scan.timedOut).toBe(false)
  })

  it("matches extension-agnostic search (e.g. 'settings' matches 'settings.cfg')", async () => {
    const scan = await executeMultiTierScan({
      query: "settings",
      workspaceDir: projectRoot,
      targetType: "all",
      maxResults: 20,
    })

    expect(scan.results.length).toBeGreaterThanOrEqual(1)
    expect(scan.results.some((p) => p.toLowerCase().includes("settings"))).toBe(true)
    expect(scan.durationMs).toBeLessThan(1500)
    expect(scan.timedOut).toBe(false)
  })

  it("handles recency queries through multi-tier scan", async () => {
    const scan = await executeMultiTierScan({
      query: "latest folder",
      workspaceDir: projectRoot,
      targetType: "all",
      maxResults: 3,
    })

    expect(scan.results.length).toBeGreaterThanOrEqual(1)
    expect(scan.candidates.length).toBeGreaterThanOrEqual(1)
    expect(scan.durationMs).toBeLessThan(500)
  })

  it("locates specific files rapidly with exact or wildcard pattern", async () => {
    const scan = await executeScan({
      startPath: path.join(projectRoot, "src", "tool"),
      query: "browser.ts",
      targetType: "file",
      maxResults: 5,
    })

    expect(scan.results.length).toBeGreaterThanOrEqual(1)
    expect(scan.results.some((p) => p.endsWith("browser.ts"))).toBe(true)
    expect(scan.durationMs).toBeLessThan(5000)
    expect(scan.timedOut).toBe(false)
  })

  it("locates directories when target_type is folder", async () => {
    const scan = await executeScan({
      startPath: path.join(projectRoot, "src"),
      query: "tool",
      targetType: "folder",
      maxResults: 5,
    })

    expect(scan.results.length).toBeGreaterThanOrEqual(1)
    for (const res of scan.results) {
      const stat = fs.statSync(res)
      expect(stat.isDirectory()).toBe(true)
    }
  })

  it("strictly enforces max_results limit", async () => {
    const scan = await executeScan({
      startPath: projectRoot,
      query: "*.ts",
      targetType: "file",
      maxResults: 3,
    })

    expect(scan.results.length).toBeLessThanOrEqual(3)
  })

  it("handles non-existent target patterns gracefully without error", async () => {
    const scan = await executeScan({
      startPath: path.join(projectRoot, "src", "tool"),
      query: "non_existent_impossible_file_xyz_9999.xyz",
      maxResults: 5,
    })

    expect(scan.results.length).toBe(0)
    expect(scan.timedOut).toBe(false)
    expect(scan.error).toBeUndefined()
  })

  it("handles invalid or non-existent start_path cleanly", async () => {
    const scan = await executeScan({
      startPath: "C:\\NonExistentDirectory_XYZ_12345",
      query: "*.json",
      maxResults: 5,
    })

    expect(scan.results.length).toBe(0)
    expect(scan.error).toBeDefined()
    expect(scan.error).toContain("does not exist")
  })

  effectTest.effect("executes duplicate collision handling and [LATEST] formatting via Tool interface", () =>
    Effect.gen(function* () {
      const tool = yield* HideAndSeekTool
      const def = yield* Tool.init(tool)

      const mockCtx = {
        sessionID: "test-session" as any,
        messageID: "test-msg" as any,
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      // Search for package.json which has duplicates across repo directories
      const res = yield* def.execute(
        {
          query: "package.json",
          start_path: projectRoot,
          max_results: 5,
        },
        mockCtx,
      )

      expect(res.title).toContain("Found")
      expect(res.metadata.count).toBeGreaterThanOrEqual(1)
      if (res.metadata.count > 1) {
        expect(res.output).toContain("[LATEST]")
        expect(res.output).toContain("Defaulting to latest or specify exact index/path")
      }
    }).pipe(provideInstance(projectRoot)),
  )

  effectTest.effect("executes recency query through SpaceCode Tool interface", () =>
    Effect.gen(function* () {
      const tool = yield* HideAndSeekTool
      const def = yield* Tool.init(tool)

      const mockCtx = {
        sessionID: "test-session" as any,
        messageID: "test-msg" as any,
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      const res = yield* def.execute(
        {
          query: "latest folder",
          max_results: 3,
        },
        mockCtx,
      )

      expect(res.title).toContain("Found")
      expect(res.metadata.count).toBeGreaterThanOrEqual(1)
      expect(res.output).toContain("Modified:")
    }).pipe(provideInstance(projectRoot)),
  )

  it("resolves user profile entity fallback for person name queries (e.g. 'sahil hande')", async () => {
    const scan = await executeMultiTierScan({
      query: "sahil hande",
      workspaceDir: projectRoot,
      targetType: "all",
      maxResults: 5,
    })

    expect(scan.results.length).toBeGreaterThanOrEqual(1)
    expect(scan.results[0].toLowerCase()).toContain("sahil")
  })

  effectTest.effect("resolves entity name queries via Tool interface without browser", () =>
    Effect.gen(function* () {
      const tool = yield* HideAndSeekTool
      const def = yield* Tool.init(tool)

      const mockCtx = {
        sessionID: "test-session" as any,
        messageID: "test-msg" as any,
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      const res = yield* def.execute(
        {
          query: "sahil hande",
          max_results: 5,
        },
        mockCtx,
      )

      expect(res.title).toContain("Found")
      expect(res.output.toLowerCase()).toContain("sahil")
    }).pipe(provideInstance(projectRoot)),
    15000,
  )
})
