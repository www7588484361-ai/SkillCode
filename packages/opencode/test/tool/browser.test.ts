import { describe, expect } from "bun:test"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import { Effect, Layer, Exit, Cause } from "effect"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "@/tool/truncate"
import { Config } from "@/config/config"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"
import { Tool } from "@/tool/tool"
import { BrowserTool } from "../../src/tool/browser"
import { provideInstance, testInstanceStoreLayer } from "../fixture/fixture"
import fs from "node:fs"

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

const it = testEffect(testLayer)

function makeCtx(): Tool.Context {
  return {
    sessionID: SessionID.descending(),
    messageID: MessageID.ascending(),
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata() {
      return Effect.void
    },
    ask() {
      return Effect.void
    },
  }
}

describe("BrowserTool", () => {
  it.effect(
    "executes full dual-mode workflow: navigate, snapshot, type, click, screenshot, close",
    () =>
      Effect.gen(function* () {
        const info = yield* BrowserTool
        const def = yield* Tool.init(info)
        const ctx = makeCtx()

        // 1. Navigate to data URL with tabs, video cards, contenteditable, and interactive controls
        const html = encodeURIComponent(`
          <!DOCTYPE html>
          <html>
            <head><title>SpaceCode SPA Test Page</title></head>
            <body style="min-height: 2000px;">
              <div role="tablist">
                <div role="tab" aria-selected="false" id="tab-home">Home</div>
                <div role="tab" aria-selected="false" id="tab-videos" onclick="document.getElementById('tab-result').innerText = 'Videos Tab Clicked!'">Videos</div>
              </div>
              <div id="tab-result">None</div>
              <input id="search-box" placeholder="Search query" value="" />
              <button id="submit-btn" onclick="document.getElementById('result').innerText = 'Submitted!'">Submit</button>
              <div class="video-card">
                <a id="video-title" title="Latest Upload - Episode 1" href="https://example.com/watch?v=123" aria-label="Latest Upload - Episode 1 by TestChannel 2 days ago 100K views">Latest Upload - Episode 1</a>
                <div id="metadata-line"><span>100K views</span><span>2 days ago</span></div>
              </div>
              <div id="contenteditable-root" contenteditable="true" aria-placeholder="Add a comment..."></div>
              <button id="popup-btn" onclick="const w = window.open('about:blank', '_blank'); if (w) { w.document.title = 'Popup Page'; }">Open Popup</button>
              <div id="result">Initial</div>
            </body>
          </html>
        `)
        const dataUrl = `data:text/html;charset=utf-8,${html}`

        const navRes = yield* def.execute({ action: "navigate", url: dataUrl }, ctx)
        expect(navRes.metadata.action).toBe("navigate")
        expect(navRes.metadata.pageTitle).toBe("SpaceCode SPA Test Page")

        // 2. Snapshot (SPA-enhanced flow)
        const snapRes = yield* def.execute({ action: "snapshot" }, ctx)
        expect(snapRes.metadata.action).toBe("snapshot")
        expect(snapRes.metadata.count).toBeGreaterThanOrEqual(5)
        expect(snapRes.output).toContain('[ACTIVE TAB: "SpaceCode SPA Test Page" | URL:')
        expect(snapRes.output).toContain('tab: "Videos"')
        expect(snapRes.output).toContain('video: "Latest Upload - Episode 1"')
        expect(snapRes.output).toContain("100K views")
        expect(snapRes.output).toContain("contenteditable")

        // 3. Click text (Smart text/tab targeting)
        const clickTextRes = yield* def.execute({ action: "click_text", text: "Videos" }, ctx)
        expect(clickTextRes.metadata.action).toBe("click_text")
        expect(clickTextRes.output).toContain("Videos")

        // 4. Type into contenteditable comment root
        const typeRes = yield* def.execute(
          { action: "type", selector: "div#contenteditable-root", text: "Great video!" },
          ctx,
        )
        expect(typeRes.metadata.action).toBe("type")
        expect(typeRes.output).toContain("Great video!")

        // 5. Scroll down 300px
        const scrollRes = yield* def.execute({ action: "scroll", direction: "down", amount: 300 }, ctx)
        expect(scrollRes.metadata.action).toBe("scroll")
        expect(scrollRes.metadata.amount).toBe(300)

        // 6. Wait
        const waitRes = yield* def.execute({ action: "wait", seconds: 0.2 }, ctx)
        expect(waitRes.metadata.action).toBe("wait")

        // 7. Screenshot (Vision flow with active tab header)
        const screenRes = yield* def.execute({ action: "screenshot" }, ctx)
        expect(screenRes.metadata.action).toBe("screenshot")
        expect(screenRes.output).toContain('[ACTIVE TAB: "SpaceCode SPA Test Page" | URL:')
        expect(screenRes.metadata.path).toBeDefined()
        expect(fs.existsSync(screenRes.metadata.path)).toBe(true)
        expect(screenRes.metadata.width).toBeGreaterThan(0)
        expect(screenRes.metadata.height).toBeGreaterThan(0)

        // 8. Popup / Target Creation & Desync Guard Test
        const popupClickRes = yield* def.execute({ action: "click_text", text: "Open Popup" }, ctx)
        expect(popupClickRes.metadata.action).toBe("click_text")
        expect(popupClickRes.output).toContain('Notice: Active tab switched to "Popup Page"')

        // Snapshot should now automatically target the new active popup tab
        const popupSnap = yield* def.execute({ action: "snapshot" }, ctx)
        expect(popupSnap.metadata.action).toBe("snapshot")
        expect(popupSnap.output).toContain('[ACTIVE TAB: "Popup Page"')

        // Close the popup tab and verify focus returns to the original tab
        const closePopupRes = yield* def.execute({ action: "close_tab" }, ctx)
        expect(closePopupRes.metadata.action).toBe("close_tab")

        const returnedSnap = yield* def.execute({ action: "snapshot" }, ctx)
        expect(returnedSnap.output).toContain('[ACTIVE TAB: "SpaceCode SPA Test Page"')

        // 9. Tab Management: new_tab, list_tabs, switch_tab, close_tab
        const tab2Html = encodeURIComponent(`<!DOCTYPE html><html><head><title>Second Tab</title></head><body><h1>Second Page</h1></body></html>`)
        const tab2Url = `data:text/html;charset=utf-8,${tab2Html}`
        const newTabRes = yield* def.execute({ action: "new_tab", url: tab2Url }, ctx)
        expect(newTabRes.metadata.action).toBe("new_tab")
        expect(newTabRes.metadata.pageTitle).toBe("Second Tab")

        // List tabs
        const listRes1 = yield* def.execute({ action: "list_tabs" }, ctx)
        expect(listRes1.metadata.action).toBe("list_tabs")
        expect(listRes1.metadata.count).toBe(2)
        expect(listRes1.output).toContain("Second Tab")
        expect(listRes1.output).toContain("SpaceCode SPA Test Page")

        // Switch to second tab by title
        const switchTitleRes = yield* def.execute({ action: "switch_tab", tab_title: "Second" }, ctx)
        expect(switchTitleRes.metadata.action).toBe("switch_tab")
        expect(switchTitleRes.metadata.tab_index).toBe(1)

        // Switch back to first tab by index
        const switchRes = yield* def.execute({ action: "switch_tab", tab_index: 0 }, ctx)
        expect(switchRes.metadata.action).toBe("switch_tab")
        expect(switchRes.metadata.tab_index).toBe(0)

        // Close second tab
        const closeTabRes = yield* def.execute({ action: "close_tab", tab_index: 1 }, ctx)
        expect(closeTabRes.metadata.action).toBe("close_tab")
        expect(closeTabRes.metadata.remaining_count).toBe(1)

        // 10. Close browser
        const closeRes = yield* def.execute({ action: "close" }, ctx)
        expect(closeRes.metadata.action).toBe("close")
        expect(closeRes.output).toContain("Browser session closed successfully.")
      }).pipe(provideInstance(process.cwd())),
    35000,
  )

  it.effect(
    "penetrates Shadow DOM web components and executes robust clicks flawlessly",
    () =>
      Effect.gen(function* () {
        const info = yield* BrowserTool
        const def = yield* Tool.init(info)
        const ctx = makeCtx()

        const html = encodeURIComponent(`
          <!DOCTYPE html>
          <html>
            <head><title>Shadow DOM Test</title></head>
            <body>
              <div id="status">Initial State</div>
              <custom-component id="comp"></custom-component>
              <script>
                class CustomComponent extends HTMLElement {
                  constructor() {
                    super();
                    const shadow = this.attachShadow({ mode: 'open' });
                    shadow.innerHTML = \`
                      <style>
                        button { padding: 12px 24px; font-size: 16px; cursor: pointer; }
                      </style>
                      <yt-button-shape>
                        <button id="shadow-btn" onclick="document.getElementById('status').innerText = 'Shadow Button Clicked!'">
                          Subscribe Now
                        </button>
                      </yt-button-shape>
                    \`;
                  }
                }
                customElements.define('custom-component', CustomComponent);
              </script>
            </body>
          </html>
        `)
        const dataUrl = `data:text/html;charset=utf-8,${html}`

        const navRes = yield* def.execute({ action: "navigate", url: dataUrl }, ctx)
        expect(navRes.metadata.action).toBe("navigate")

        // 1. Snapshot finds the shadow DOM button
        const snap = yield* def.execute({ action: "snapshot" }, ctx)
        expect(snap.output).toContain("Subscribe Now")

        // 2. Click text finds and clicks the shadow DOM element
        const clickTextRes = yield* def.execute({ action: "click_text", text: "Subscribe Now" }, ctx)
        expect(clickTextRes.metadata.action).toBe("click_text")
        expect(clickTextRes.output).toContain("Subscribe Now")

        // 3. Snapshot with target_id click
        const snap2 = yield* def.execute({ action: "snapshot" }, ctx)
        const match = snap2.output.match(/\[(\d+)\]\s+button:\s+"Subscribe Now"/)
        expect(match).not.toBeNull()
        const targetId = Number(match![1])

        const clickIdRes = yield* def.execute({ action: "click", target_id: targetId }, ctx)
        expect(clickIdRes.metadata.action).toBe("click")
        expect(clickIdRes.output).toContain(`element [${targetId}]`)

        // 4. Close browser
        yield* def.execute({ action: "close" }, ctx)
      }).pipe(provideInstance(process.cwd())),
    35000,
  )

  it.effect("blocks speculative website navigation when user prompt is a desktop open request (e.g. 'open cline')", () =>
    Effect.gen(function* () {
      const info = yield* BrowserTool
      const def = yield* Tool.init(info)
      const ctx: Tool.Context = {
        sessionID: SessionID.descending(),
        messageID: MessageID.ascending(),
        agent: "build",
        abort: new AbortController().signal,
        messages: [
          {
            info: {
              id: MessageID.ascending(),
              sessionID: SessionID.descending(),
              role: "user",
              time: { created: Date.now() },
              agent: "build",
              model: { providerID: "test" as any, modelID: "test" as any },
            },
            parts: [
              {
                id: "part-1" as any,
                sessionID: SessionID.descending(),
                messageID: MessageID.ascending(),
                type: "text",
                text: "open cline",
              },
            ],
          } as any,
        ],
        metadata() {
          return Effect.void
        },
        ask() {
          return Effect.void
        },
      }

      const exit = yield* Effect.exit(def.execute({ action: "navigate", url: "https://cline.ai" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.pretty(exit.cause)).toContain("Speculative website navigation is blocked")
      }
    }).pipe(provideInstance(process.cwd())),
  )

  it.effect("blocks speculative navigation for plain keywords without protocol/TLD (e.g. 'cline')", () =>
    Effect.gen(function* () {
      const info = yield* BrowserTool
      const def = yield* Tool.init(info)
      const ctx = makeCtx()

      const exit = yield* Effect.exit(def.execute({ action: "navigate", url: "cline" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.pretty(exit.cause)).toContain("not a valid web URL")
      }
    }).pipe(provideInstance(process.cwd())),
  )
})
