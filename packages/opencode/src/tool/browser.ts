import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import type { Browser, Page, ElementHandle, KeyInput } from "puppeteer-core"

export const Parameters = Schema.Struct({
  action: Schema.Literals([
    "navigate",
    "snapshot",
    "screenshot",
    "click",
    "click_text",
    "type",
    "key_press",
    "scroll",
    "wait",
    "new_tab",
    "switch_tab",
    "list_tabs",
    "close_tab",
    "close",
  ]).annotate({
    description:
      "The browser action to perform: 'navigate', 'snapshot', 'screenshot', 'click', 'click_text', 'type', 'key_press', 'scroll', 'wait', 'new_tab', 'switch_tab', 'list_tabs', 'close_tab', or 'close'.",
  }),
  url: Schema.optional(Schema.String).annotate({
    description: "URL to navigate to (required for 'navigate', optional for 'new_tab').",
  }),
  target_id: Schema.optional(Schema.Number).annotate({
    description: "The numeric reference ID of the target interactive element obtained from a previous 'snapshot'.",
  }),
  x: Schema.optional(Schema.Number).annotate({
    description: "Horizontal X coordinate in pixels for coordinate-based click (for vision models).",
  }),
  y: Schema.optional(Schema.Number).annotate({
    description: "Vertical Y coordinate in pixels for coordinate-based click (for vision models).",
  }),
  text: Schema.optional(Schema.String).annotate({
    description:
      "Text string to enter into target/focused input (for 'type') or query text to fuzzy find and click (for 'click_text').",
  }),
  key: Schema.optional(Schema.String).annotate({
    description: "Key name to press, e.g. 'Enter', 'Tab', 'Escape', 'ArrowDown', 'Backspace' (for 'key_press').",
  }),
  direction: Schema.optional(Schema.Literals(["up", "down"])).annotate({
    description: "Scroll direction: 'up' or 'down' (default: 'down', for 'scroll').",
  }),
  amount: Schema.optional(Schema.Number).annotate({
    description: "Pixel amount to scroll (default: 600, for 'scroll').",
  }),
  seconds: Schema.optional(Schema.Number).annotate({
    description: "Seconds to pause or wait (default: 2, for 'wait').",
  }),
  selector: Schema.optional(Schema.String).annotate({
    description: "Optional CSS selector to wait for (for 'wait') or target (for 'type').",
  }),
  tab_index: Schema.optional(Schema.Number).annotate({
    description: "Zero-based index of the target tab (for 'switch_tab' or 'close_tab').",
  }),
  tab_title: Schema.optional(Schema.String).annotate({
    description: "Title or partial title/URL match for switching tabs (for 'switch_tab').",
  }),
})

function findHostBrowser(): string {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ]

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      return p
    }
  }

  throw new Error(
    "Could not find a host browser executable (Edge or Chrome). Please ensure Microsoft Edge or Google Chrome is installed.",
  )
}

const BLOCKED_RESOURCES = new Set(["image", "media", "stylesheet", "font"])
const interceptedPages = new WeakSet<Page>()

async function setupPageInterception(page: Page): Promise<void> {
  if (!page || page.isClosed() || interceptedPages.has(page)) return
  interceptedPages.add(page)
  try {
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      try {
        const resourceType = req.resourceType()
        if (BLOCKED_RESOURCES.has(resourceType)) {
          req.abort("blockedbyclient").catch(() => {})
        } else {
          req.continue().catch(() => {})
        }
      } catch {
        try {
          req.continue().catch(() => {})
        } catch {}
      }
    })
  } catch {
    // ignore if already intercepted or page closed
  }
}

class BrowserSession {
  private browser: Browser | null = null
  private elementMap: Map<number, ElementHandle<Element>> = new Map()
  private lastTargetPage: Page | null = null
  private lastKnownUrl: string | null = null
  private lastKnownPage: Page | null = null

  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser
    }

    const executablePath = findHostBrowser()
    const puppeteer = (await import("puppeteer-core")).default

    const profileDir = path.join(os.homedir(), ".spacecode", "browser-profile")
    fs.mkdirSync(profileDir, { recursive: true })

    this.browser = await puppeteer.launch({
      executablePath,
      headless: true,
      defaultViewport: { width: 1280, height: 800 },
      userDataDir: profileDir,
      args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-component-extensions-with-background-pages",
        "--disable-extensions",
        "--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints",
        "--disable-ipc-flooding-protection",
        "--disable-renderer-backgrounding",
        "--disable-sync",
        "--metrics-recording-only",
        "--mute-audio",
        "--blink-settings=imagesEnabled=false",
        "--disable-blink-features=AutomationControlled",
      ],
    })

    this.browser.on("targetcreated", async (target) => {
      if (target.type() === "page") {
        const page = await target.page().catch(() => null)
        if (page) {
          this.lastTargetPage = page
          await setupPageInterception(page)
        }
      }
    })

    this.browser.on("targetdestroyed", () => {
      if (this.lastTargetPage && this.lastTargetPage.isClosed()) {
        this.lastTargetPage = null
      }
    })

    this.browser.on("disconnected", () => {
      this.browser = null
      this.elementMap.clear()
      this.lastTargetPage = null
      this.lastKnownUrl = null
      this.lastKnownPage = null
    })

    const initialPages = await this.browser.pages().catch(() => [])
    for (const page of initialPages) {
      await setupPageInterception(page)
    }

    return this.browser
  }

  async getActivePage(): Promise<Page> {
    const browser = await this.getBrowser()
    const pages = (await browser.pages()).filter((p) => !p.isClosed())
    if (pages.length === 0) {
      const p = await browser.newPage()
      await setupPageInterception(p)
      await p.bringToFront().catch(() => {})
      this.lastTargetPage = p
      return p
    }

    for (const p of pages) {
      await setupPageInterception(p)
    }

    // 1. If a target was tracked (e.g. newly created tab/popup or switched tab) and is still open, prioritize it
    if (this.lastTargetPage && !this.lastTargetPage.isClosed() && pages.includes(this.lastTargetPage)) {
      await this.lastTargetPage.bringToFront().catch(() => {})
      return this.lastTargetPage
    }

    // 2. Prioritize pages in reverse order (newest first) with document.hasFocus()
    for (let i = pages.length - 1; i >= 0; i--) {
      const p = pages[i]
      if (p.isClosed()) continue
      const hasFocus = await p.evaluate(() => document.hasFocus()).catch(() => false)
      if (hasFocus) {
        this.lastTargetPage = p
        await p.bringToFront().catch(() => {})
        return p
      }
    }

    // 3. Prioritize pages in reverse order (newest first) with document.visibilityState === "visible"
    for (let i = pages.length - 1; i >= 0; i--) {
      const p = pages[i]
      if (p.isClosed()) continue
      const isVisible = await p
        .evaluate(() => document.visibilityState === "visible")
        .catch(() => false)
      if (isVisible) {
        this.lastTargetPage = p
        await p.bringToFront().catch(() => {})
        return p
      }
    }

    // 4. Fallback to latest opened page
    const candidate = pages[pages.length - 1]
    this.lastTargetPage = candidate
    await candidate.bringToFront().catch(() => {})
    return candidate
  }

  async getPage(): Promise<Page> {
    return this.getActivePage()
  }

  async checkSync(page: Page, action: string): Promise<string | null> {
    const currentUrl = page.url()
    const currentTitle = await page.title().catch(() => "")
    let notice: string | null = null

    const isExplicitNav = action === "navigate" || action === "new_tab" || action === "switch_tab"
    const hasChanged =
      this.lastKnownUrl !== null &&
      (this.lastKnownUrl !== currentUrl || (this.lastKnownPage !== null && this.lastKnownPage !== page))

    if (hasChanged) {
      this.elementMap.clear()
      if (!isExplicitNav) {
        notice = `Notice: Active tab switched to "${currentTitle}" (${currentUrl}). Interactive element IDs have been refreshed for this page.`
      }
    }

    this.lastKnownUrl = currentUrl
    this.lastKnownPage = page

    return notice
  }

  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close()
      } catch {
        // ignore
      }
      this.browser = null
      this.elementMap.clear()
      this.lastTargetPage = null
      this.lastKnownUrl = null
      this.lastKnownPage = null
    }
  }

  setElements(map: Map<number, ElementHandle<Element>>) {
    this.elementMap = map
  }

  getElement(id: number): ElementHandle<Element> | undefined {
    return this.elementMap.get(id)
  }
}

export const session = new BrowserSession()

const cleanup = () => {
  session.close().catch(() => {})
}
process.on("exit", cleanup)
process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)

interface RobustClickResult {
  success: boolean
  x: number
  y: number
  text?: string
  tag?: string
}

/**
 * OpenClaw-inspired robust browser interaction engine.
 * Handles deep Shadow DOM penetration, center coordinate calculations,
 * actionability verification, and dual-layer synthetic/hardware event dispatch.
 */
async function executeRobustClick(
  page: Page,
  target: { id?: number; selector?: string; x?: number; y?: number },
  options: {
    doubleClick?: boolean
    button?: "left" | "right" | "middle"
    delayMs?: number
  } = {},
): Promise<RobustClickResult> {
  const button = options.button ?? "left"
  const buttonCode = button === "middle" ? 1 : button === "right" ? 2 : 0
  const pressedButtons = button === "middle" ? 4 : button === "right" ? 2 : 1
  const delayMs = Math.max(0, options.delayMs ?? 50)
  const doubleClick = Boolean(options.doubleClick)

  const inPageResult = await page.evaluate(
    (targetParam, btnCode, pressedBtns, dMs, dblClick) => {
      // Helper to query selector across Light DOM and all open Shadow Roots recursively
      const findDeepSelector = (root: Document | ShadowRoot | Element, sel: string): HTMLElement | null => {
        try {
          const direct = root.querySelector(sel) as HTMLElement | null
          if (direct) return direct
        } catch {}
        try {
          const allEls = Array.from(root.querySelectorAll<Element>("*"))
          for (const child of allEls) {
            if (child.shadowRoot) {
              const found = findDeepSelector(child.shadowRoot, sel)
              if (found) return found
            }
          }
        } catch {}
        return null
      }

      let el: HTMLElement | null = null
      let targetX = targetParam.x
      let targetY = targetParam.y

      if (targetParam.id !== undefined) {
        const idStr = String(targetParam.id)
        el = findDeepSelector(document, `[data-spacecode-id="${idStr}"]`)
        if (!el) {
          return { success: false, error: `Interactive element with target_id [${targetParam.id}] not found.` }
        }
      } else if (targetParam.selector) {
        el = findDeepSelector(document, targetParam.selector)
        if (!el) {
          return { success: false, error: `Element matching selector "${targetParam.selector}" not found.` }
        }
      }

      // If an element was targeted, bring to viewport center and calculate center coordinates
      if (el) {
        if (typeof (el as any).scrollIntoViewIfNeeded === "function") {
          ;(el as any).scrollIntoViewIfNeeded()
        } else {
          el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" })
        }

        const rect = el.getBoundingClientRect()
        targetX = Math.round(rect.left + rect.width / 2)
        targetY = Math.round(rect.top + rect.height / 2)
      }

      if (targetX === undefined || targetY === undefined) {
        return { success: false, error: "Coordinates could not be determined." }
      }

      // Clamp coordinates to current viewport
      const vw = window.innerWidth || document.documentElement.clientWidth || 1280
      const vh = window.innerHeight || document.documentElement.clientHeight || 800
      const clampedX = Math.max(1, Math.min(vw - 1, targetX))
      const clampedY = Math.max(1, Math.min(vh - 1, targetY))

      // Deep Shadow DOM Penetration from coordinates
      let hit = document.elementFromPoint(clampedX, clampedY) as HTMLElement | null
      while (hit?.shadowRoot && typeof (hit.shadowRoot as any).elementFromPoint === "function") {
        const inner = (hit.shadowRoot as any).elementFromPoint(clampedX, clampedY) as HTMLElement | null
        if (!inner || inner === hit) break
        hit = inner
      }

      // Resolve through <slot> if encountered
      if (hit && hit.tagName.toLowerCase() === "slot") {
        const assigned = (hit as HTMLSlotElement).assignedElements()
        if (assigned.length > 0) {
          hit = assigned[0] as HTMLElement
        }
      }

      // Resolve the most appropriate clickable target
      const interactiveSelector =
        'button, a, input, textarea, select, [role="button"], [role="tab"], [role="link"], [role="checkbox"], [role="radio"], [role="menuitem"], yt-button-shape, tp-yt-paper-button, tp-yt-paper-tab, yt-tab-shape'
      const clickableCandidate = hit?.closest?.(interactiveSelector) as HTMLElement | null
      const effectiveTarget = clickableCandidate || hit || el || document.body

      const text = (
        effectiveTarget.innerText ||
        effectiveTarget.getAttribute?.("aria-label") ||
        el?.innerText ||
        ""
      ).trim()
      const tag = effectiveTarget.tagName.toLowerCase()

      // Focus effective target if focusable
      if (typeof effectiveTarget.focus === "function") {
        try {
          effectiveTarget.focus()
        } catch {}
      }

      // Check if element is reachable at the given coordinates
      const isDirectlyReachable = Boolean(
        hit &&
          (hit === el ||
            hit === effectiveTarget ||
            hit.contains(effectiveTarget) ||
            effectiveTarget.contains(hit) ||
            (el && (hit.contains(el) || el.contains(hit) || hit.getRootNode() === el.shadowRoot || hit.getRootNode() === el.getRootNode()))),
      )

      return {
        success: true,
        useHardwareClick: isDirectlyReachable,
        x: clampedX,
        y: clampedY,
        text: text.slice(0, 80),
        tag,
      }
    },
    target,
    buttonCode,
    pressedButtons,
    delayMs,
    doubleClick,
  )

  if (!inPageResult.success) {
    throw new Error((inPageResult as any).error || "Click failed.")
  }

  if (inPageResult.useHardwareClick) {
    // Hardware mouse click via Puppeteer CDP
    try {
      await page.mouse.move(inPageResult.x, inPageResult.y)
      await page.mouse.down({ button })
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
      await page.mouse.up({ button })

      if (doubleClick) {
        await new Promise((r) => setTimeout(r, 50))
        await page.mouse.down({ button, clickCount: 2 })
        await page.mouse.up({ button, clickCount: 2 })
      }
    } catch {
      // Fallback to in-page click if CDP mouse fails
      await page
        .evaluate(
          (coords) => {
            const el = document.elementFromPoint(coords.x, coords.y) as HTMLElement | null
            if (el && typeof el.click === "function") {
              el.click()
            }
          },
          { x: inPageResult.x, y: inPageResult.y },
        )
        .catch(() => {})
    }
  } else {
    // Fallback: In-page synthetic event dispatch when occluded or off-screen
    await page.evaluate(
      (coords, btnCode, pressedBtns, dblClick) => {
        const target = document.elementFromPoint(coords.x, coords.y) || document.body
        const baseInit: PointerEventInit & MouseEventInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX: coords.x,
          clientY: coords.y,
          screenX: (window.screenX || 0) + coords.x,
          screenY: (window.screenY || 0) + coords.y,
          button: btnCode,
        }

        const dispatch = (type: string, evClass: typeof MouseEvent, buttons: number, detail: number) => {
          try {
            const ev = new evClass(type, { ...baseInit, buttons, detail })
            target.dispatchEvent(ev)
          } catch {
            try {
              const ev = new MouseEvent(type, { ...baseInit, buttons, detail })
              target.dispatchEvent(ev)
            } catch {}
          }
        }

        dispatch("pointerdown", PointerEvent, pressedBtns, 1)
        dispatch("mousedown", MouseEvent, pressedBtns, 1)
        dispatch("pointerup", PointerEvent, 0, 1)
        dispatch("mouseup", MouseEvent, 0, 1)
        dispatch("click", MouseEvent, 0, 1)

        if (dblClick) {
          dispatch("pointerdown", PointerEvent, pressedBtns, 2)
          dispatch("mousedown", MouseEvent, pressedBtns, 2)
          dispatch("pointerup", PointerEvent, 0, 2)
          dispatch("mouseup", MouseEvent, 0, 2)
          dispatch("click", MouseEvent, 0, 2)
          dispatch("dblclick", MouseEvent, 0, 2)
        }

        try {
          if (typeof (target as any).click === "function") {
            ;(target as any).click()
          }
        } catch {}
      },
      { x: inPageResult.x, y: inPageResult.y },
      buttonCode,
      pressedButtons,
      doubleClick,
    )
  }

  return inPageResult as RobustClickResult
}

function extractLastUserPrompt(messages?: any[]): string {
  if (!messages || !Array.isArray(messages) || messages.length === 0) return ""
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.info?.role === "user" && Array.isArray(msg?.parts)) {
      const texts: string[] = []
      for (const part of msg.parts) {
        if (part?.type === "text" && typeof part.text === "string") {
          texts.push(part.text.trim())
        }
      }
      if (texts.length > 0) {
        return texts.join(" ")
      }
    }
  }
  return ""
}

export const BrowserTool = Tool.define(
  "browser",
  Effect.gen(function* () {
    return {
      description:
        "Automated headless browser for scraping web pages, reading documentation, API references, or extracting page text. STRICT USAGE: DO NOT use for user-facing video playback, media viewing, or opening sites for the user (use 'os_execute' with 'cmd.exe /c start \"\" \"<url>\"' to launch in the user's desktop browser instead). ONLY call when navigating to an explicit URL for data extraction or automated testing. NEVER use for local file, entity, or person queries like 'find sahil hande' (use 'hide_and_seek' instead). Supports: navigate, snapshot, screenshot, click, click_text, type, key_press, scroll, wait, new_tab, switch_tab, list_tabs, close_tab, and close.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "browser",
            patterns: [params.action],
            always: ["*"],
            metadata: params,
          })

          return yield* Effect.promise(async () => {
            if (params.action === "close") {
              await session.close()
              return {
                title: "Browser Close",
                metadata: { action: "close" },
                output: "Browser session closed successfully.",
              }
            }

            if (params.action === "navigate") {
              if (!params.url) {
                throw new Error("'url' parameter is required for 'navigate' action.")
              }
              const rawUrl = params.url.trim()
              if (
                !/^https?:\/\//i.test(rawUrl) &&
                !rawUrl.startsWith("about:") &&
                !rawUrl.startsWith("file:") &&
                !rawUrl.startsWith("data:")
              ) {
                if (!rawUrl.includes(".") && !rawUrl.toLowerCase().startsWith("localhost")) {
                  throw new Error(
                    `'${params.url}' is not a valid web URL. If you are looking for a local file, folder, application, or user directory, use 'hide_and_seek' or 'os_execute' instead of 'browser'.`,
                  )
                }
              }

              // Hard guardrail against speculative website navigation for app/desktop open requests
              const lastUserPrompt = extractLastUserPrompt(ctx.messages)
              if (
                lastUserPrompt &&
                !rawUrl.startsWith("about:") &&
                !rawUrl.startsWith("file:") &&
                !rawUrl.startsWith("data:") &&
                !rawUrl.toLowerCase().startsWith("localhost")
              ) {
                const hasExplicitUrlOrWebIntent =
                  /https?:\/\//i.test(lastUserPrompt) ||
                  /\bwww\./i.test(lastUserPrompt) ||
                  /\b[a-z0-9\-]+\.[a-z]{2,}\b/i.test(lastUserPrompt) ||
                  /\b(website|sites?|browsers?|browse|web|online|internet|urls?|links?|webpages?|search|google|bing|youtube|http)\b/i.test(
                    lastUserPrompt,
                  )

                if (!hasExplicitUrlOrWebIntent) {
                  throw new Error(
                    "Speculative website navigation is blocked. Use os_execute to launch desktop applications unless the user explicitly requested a web URL or website.",
                  )
                }
              }
            }

            const page = await session.getActivePage()
            await page.bringToFront().catch(() => {})
            const preNotice = await session.checkSync(page, params.action)

            switch (params.action) {
              case "navigate": {
                let targetUrl = params.url.trim()
                if (
                  !/^https?:\/\//i.test(targetUrl) &&
                  !targetUrl.startsWith("about:") &&
                  !targetUrl.startsWith("file:") &&
                  !targetUrl.startsWith("data:")
                ) {
                  targetUrl = "https://" + targetUrl
                }

                try {
                  await page.goto(targetUrl, {
                    waitUntil: "domcontentloaded",
                    timeout: 5000,
                  })
                } catch (err: any) {
                  const currentUrl = page.url()
                  if (err?.message?.includes("Navigation timeout") || err?.name === "TimeoutError") {
                    if (currentUrl && currentUrl !== "about:blank") {
                      // Proceed with loaded DOM
                    } else {
                      throw err
                    }
                  } else {
                    throw err
                  }
                }
                await session.checkSync(page, params.action)
                const title = await page.title()
                const currentUrl = page.url()

                const output = `Navigated to ${currentUrl} (Title: "${title}"). Use action: 'snapshot' for interactive element list or action: 'screenshot' for vision capture.`
                return {
                  title: `Navigate: ${currentUrl}`,
                  metadata: { action: "navigate", url: currentUrl, pageTitle: title },
                  output,
                }
              }

              case "snapshot": {
                const items = await page.evaluate(() => {
                  // In-Browser DOM Stripping: Strip script, style, svg, nav, iframe, footer, noscript
                  // before traversing the DOM and collecting interactive elements.
                  try {
                    const clutter = document.querySelectorAll(
                      "script, style, svg, nav, iframe, footer, noscript",
                    )
                    clutter.forEach((el) => {
                      try {
                        el.remove()
                      } catch {}
                    })
                  } catch {}

                  const isVisible = (el: HTMLElement) => {
                    if (!el) return false
                    const style = window.getComputedStyle(el)
                    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false
                    const rect = el.getBoundingClientRect()
                    if (rect.width <= 0 || rect.height <= 0) return false

                    // Strict visible viewport check (within visible window + 150px scroll margin)
                    const vh = window.innerHeight || document.documentElement.clientHeight
                    const vw = window.innerWidth || document.documentElement.clientWidth
                    if (rect.bottom < 0 || rect.top > vh + 150 || rect.right < 0 || rect.left > vw) {
                      return false
                    }
                    return true
                  }

                  const selector = [
                    "div#contenteditable-root",
                    "yt-formatted-string#simplebox-placeholder",
                    "#placeholder-area",
                    "ytd-comment-simplebox-renderer",
                    "a#video-title",
                    "a#video-title-link",
                    "a.yt-simple-endpoint#video-title",
                    "a[href]",
                    "button",
                    "input",
                    "textarea",
                    "select",
                    '[role="tab"]',
                    '[role="button"]',
                    '[role="link"]',
                    '[role="checkbox"]',
                    '[role="radio"]',
                    '[role="menuitem"]',
                    "tp-yt-paper-tab",
                    "yt-tab-shape",
                    '[contenteditable="true"]',
                  ].join(",")

                  const collectInteractiveElements = (root: Document | ShadowRoot | Element): HTMLElement[] => {
                    const collected: HTMLElement[] = []
                    const visit = (node: Document | ShadowRoot | Element) => {
                      try {
                        const matches = Array.from(node.querySelectorAll<HTMLElement>(selector))
                        for (const m of matches) collected.push(m)
                      } catch {}

                      try {
                        const allEls = Array.from(node.querySelectorAll<Element>("*"))
                        for (const el of allEls) {
                          if (el.shadowRoot) {
                            visit(el.shadowRoot)
                          }
                        }
                      } catch {}
                    }
                    visit(root)
                    return collected
                  }

                  const all = collectInteractiveElements(document)

                  // Filter out nested descendants whose ancestor is already in list
                  const set = new Set(all)
                  const elements = all.filter((el) => {
                    let parent = el.parentElement
                    while (parent) {
                      if (set.has(parent as HTMLElement)) {
                        return false
                      }
                      parent = parent.parentElement
                    }
                    return true
                  })

                  const results: Array<{
                    id: number
                    tag: string
                    type?: string
                    role?: string
                    text: string
                    value?: string
                    placeholder?: string
                    href?: string
                    name?: string
                    meta?: string
                    selected?: boolean
                  }> = []

                  let nextId = 1
                  for (const el of elements) {
                    if (results.length >= 50) break
                    if (!isVisible(el)) continue
                    const id = nextId++
                    el.setAttribute("data-spacecode-id", String(id))

                    const tag = el.tagName.toLowerCase()
                    const type = (el as HTMLInputElement).type
                    const role = el.getAttribute("role") || undefined
                    const placeholder =
                      (el as HTMLInputElement).placeholder || el.getAttribute("aria-placeholder") || undefined
                    const value = (el as HTMLInputElement).value
                    const href = (el as HTMLAnchorElement).href || undefined
                    const name = (el as HTMLInputElement).name || undefined

                    // Determine if it's contenteditable / comment input
                    const isContentEditable =
                      el.getAttribute("contenteditable") === "true" ||
                      el.id === "contenteditable-root" ||
                      el.id === "simplebox-placeholder" ||
                      el.id === "placeholder-area" ||
                      tag === "ytd-comment-simplebox-renderer"

                    // Determine if it's a tab
                    const isTab =
                      role === "tab" ||
                      tag === "tp-yt-paper-tab" ||
                      tag === "yt-tab-shape" ||
                      el.classList.contains("tabnav-tab")
                    const selected = isTab
                      ? el.getAttribute("aria-selected") === "true" ||
                        el.classList.contains("selected") ||
                        el.hasAttribute("active")
                      : undefined

                    // Determine if it's a video title
                    const isVideo =
                      el.id === "video-title" ||
                      el.id === "video-title-link" ||
                      (Boolean(href) && href!.includes("/watch?v=") && (el.innerText || "").trim().length > 0)

                    // Extract secondary metadata (views, relative time, stream status)
                    let meta: string | undefined = undefined
                    if (isVideo) {
                      const container = el.closest(
                        "ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-rich-item-renderer",
                      )
                      if (container) {
                        const metaSpans = Array.from(
                          container.querySelectorAll("#metadata-line span, .inline-metadata-item, #byline-container"),
                        )
                          .map((s) => (s.textContent || "").trim())
                          .filter(Boolean)
                        if (metaSpans.length > 0) {
                          meta = metaSpans.join(" • ")
                        }
                      }
                    }

                    let text = (
                      (isVideo && el.getAttribute("title")) ||
                      el.innerText ||
                      el.getAttribute("aria-label") ||
                      el.getAttribute("title") ||
                      ""
                    ).trim()

                    // If aria-label contains additional timestamp/view count info, extract as fallback metadata
                    const aria = el.getAttribute("aria-label") || ""
                    if (!meta && aria && aria !== text && aria.length > text.length) {
                      meta = aria
                    }

                    if (text.length > 100) text = text.slice(0, 97) + "..."
                    if (meta && meta.length > 120) meta = meta.slice(0, 117) + "..."

                    results.push({
                      id,
                      tag: isVideo ? "video" : isTab ? "tab" : isContentEditable ? "input" : tag,
                      type: isContentEditable ? "contenteditable" : type,
                      role,
                      text,
                      value: tag === "input" || tag === "textarea" || isContentEditable ? value ?? "" : undefined,
                      placeholder: placeholder || (isContentEditable ? "Add a comment..." : undefined),
                      href,
                      name,
                      meta,
                      selected,
                    })
                  }

                  return results
                })

                const map = new Map<number, ElementHandle<Element>>()
                const lines: string[] = []

                for (const item of items) {
                  let handle = await page.$(`[data-spacecode-id="${item.id}"]`)
                  if (!handle) {
                    handle = await page.$(`pierce/[data-spacecode-id="${item.id}"]`).catch(() => null)
                  }
                  if (handle) {
                    map.set(item.id, handle)
                  }

                  if (item.tag === "video") {
                    const metaStr = item.meta ? ` (info: "${item.meta}")` : ""
                    const hrefStr = item.href ? ` (href: ${item.href})` : ""
                    lines.push(`[${item.id}] video: "${item.text}"${metaStr}${hrefStr}`)
                  } else if (item.tag === "tab") {
                    const selStr = item.selected !== undefined ? ` (selected: ${item.selected})` : ""
                    lines.push(`[${item.id}] tab: "${item.text}"${selStr}`)
                  } else if (item.tag === "input") {
                    const desc = item.placeholder || item.name || item.text || ""
                    lines.push(`[${item.id}] input (${item.type || "text"}): "${desc}" (value: "${item.value ?? ""}")`)
                  } else if (item.tag === "button" || item.role === "button") {
                    lines.push(`[${item.id}] button: "${item.text}"`)
                  } else if (item.tag === "a" || item.role === "link") {
                    lines.push(`[${item.id}] link: "${item.text}" (href: ${item.href ?? ""})`)
                  } else if (item.tag === "textarea") {
                    lines.push(
                      `[${item.id}] textarea: "${item.placeholder || item.text || ""}" (value: "${item.value ?? ""}")`,
                    )
                  } else if (item.tag === "select") {
                    lines.push(`[${item.id}] select: "${item.name || item.text || ""}"`)
                  } else {
                    lines.push(`[${item.id}] ${item.role || item.tag}: "${item.text}"`)
                  }
                }

                session.setElements(map)

                const pageTitle = await page.title()
                const currentUrl = page.url()

                const outputParts: string[] = []
                if (preNotice) outputParts.push(preNotice)
                outputParts.push(
                  `[ACTIVE TAB: "${pageTitle}" | URL: "${currentUrl}"]`,
                  `Interactive Elements (${items.length}):`,
                  lines.length > 0 ? lines.join("\n") : "(No interactive elements detected on current viewport)",
                )

                return {
                  title: `Snapshot: ${currentUrl}`,
                  metadata: { action: "snapshot", count: items.length, url: currentUrl, pageTitle },
                  output: outputParts.join("\n\n"),
                }
              }

              case "screenshot": {
                const dir = path.join(process.cwd(), ".spacecode", "browser")
                fs.mkdirSync(dir, { recursive: true })
                const filename = `screenshot_${Date.now()}.png`
                const filePath = path.join(dir, filename)

                await page.screenshot({ path: filePath })
                const viewport =
                  page.viewport() ||
                  (await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })).catch(() => null)) ||
                  { width: 1280, height: 800 }
                const pageTitle = await page.title()
                const currentUrl = page.url()

                const outputParts: string[] = []
                if (preNotice) outputParts.push(preNotice)
                outputParts.push(
                  `[ACTIVE TAB: "${pageTitle}" | URL: "${currentUrl}"]`,
                  `Screenshot saved: ${filePath}`,
                  `Viewport Dimensions: ${viewport.width}x${viewport.height}`,
                  `Page Title: "${pageTitle}"`,
                  `URL: ${currentUrl}`,
                )

                return {
                  title: `Screenshot: ${currentUrl}`,
                  metadata: {
                    action: "screenshot",
                    path: filePath,
                    width: viewport.width,
                    height: viewport.height,
                    url: currentUrl,
                    pageTitle,
                  },
                  output: outputParts.join("\n"),
                }
              }

              case "click": {
                let currentUrl = page.url()
                let title = await page.title()
                let clickDesc = ""

                if (params.target_id !== undefined) {
                  const res = await executeRobustClick(page, { id: params.target_id })
                  clickDesc = `element [${params.target_id}] (<${res.tag}> "${res.text}")`
                } else if (params.x !== undefined && params.y !== undefined) {
                  const res = await executeRobustClick(page, { x: params.x, y: params.y })
                  clickDesc = `at coordinates (${params.x}, ${params.y}) (<${res.tag}> "${res.text}")`
                } else {
                  throw new Error(
                    "Missing click target: please specify either 'target_id' (numeric ID from snapshot) or coordinates ('x' and 'y').",
                  )
                }

                await new Promise((r) => setTimeout(r, 150))
                const activePage = await session.getActivePage()
                await activePage.bringToFront().catch(() => {})
                const postNotice = await session.checkSync(activePage, params.action)
                currentUrl = activePage.url()
                title = await activePage.title()

                const notice = postNotice || preNotice
                const prefix = notice ? notice + "\n\n" : ""

                return {
                  title:
                    params.target_id !== undefined
                      ? `Click [${params.target_id}]`
                      : `Click (${params.x}, ${params.y})`,
                  metadata: {
                    action: "click",
                    target_id: params.target_id,
                    x: params.x,
                    y: params.y,
                    url: currentUrl,
                    pageTitle: title,
                  },
                  output: `${prefix}Clicked ${clickDesc}. Page is now at: ${currentUrl} (Title: "${title}").`,
                }
              }

              case "click_text": {
                const query = (params.text || "").trim()
                if (!query) {
                  throw new Error("'text' parameter is required for 'click_text' action.")
                }

                const found = await page.evaluate((targetText) => {
                  const isVisible = (el: HTMLElement) => {
                    if (!el) return false
                    const style = window.getComputedStyle(el)
                    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false
                    const rect = el.getBoundingClientRect()
                    return rect.width > 0 && rect.height > 0
                  }

                  const lowerQuery = targetText.toLowerCase()

                  const selector = [
                    "button",
                    "a",
                    '[role="tab"]',
                    '[role="button"]',
                    '[role="link"]',
                    '[role="menuitem"]',
                    "tp-yt-paper-tab",
                    "yt-tab-shape",
                    "yt-formatted-string",
                    "span",
                    "div",
                  ].join(",")

                  const collectElementsDeep = (root: Document | ShadowRoot | Element, sel: string): HTMLElement[] => {
                    const collected: HTMLElement[] = []
                    const visit = (node: Document | ShadowRoot | Element) => {
                      try {
                        const matches = Array.from(node.querySelectorAll<HTMLElement>(sel))
                        for (const m of matches) collected.push(m)
                      } catch {}
                      try {
                        const allEls = Array.from(node.querySelectorAll<Element>("*"))
                        for (const el of allEls) {
                          if (el.shadowRoot) visit(el.shadowRoot)
                        }
                      } catch {}
                    }
                    visit(root)
                    return collected
                  }

                  const all = collectElementsDeep(document, selector)

                  const getElText = (el: HTMLElement): string => {
                    return (
                      el.innerText ||
                      el.textContent ||
                      el.getAttribute("aria-label") ||
                      el.getAttribute("title") ||
                      ""
                    ).trim()
                  }

                  // 1. Exact match among visible elements
                  for (const el of all) {
                    if (!isVisible(el)) continue
                    const txt = getElText(el).toLowerCase()
                    if (txt === lowerQuery) {
                      const clickableParent = el.closest<HTMLElement>(
                        'button, a, [role="tab"], [role="button"], [role="link"], tp-yt-paper-tab, yt-tab-shape',
                      )
                      const target = clickableParent || el
                      target.setAttribute("data-spacecode-click-target", "true")
                      return { success: true, text: getElText(target), tag: target.tagName.toLowerCase() }
                    }
                  }

                  // 2. Contains match among interactive tags
                  const interactiveTags = new Set(["button", "a", "tp-yt-paper-tab", "yt-tab-shape"])
                  for (const el of all) {
                    if (!isVisible(el)) continue
                    const tag = el.tagName.toLowerCase()
                    const role = el.getAttribute("role") || ""
                    const isInteractive = interactiveTags.has(tag) || role === "tab" || role === "button" || role === "link"
                    if (isInteractive) {
                      const txt = getElText(el).toLowerCase()
                      if (txt.includes(lowerQuery)) {
                        const clickableParent = el.closest<HTMLElement>(
                          'button, a, [role="tab"], [role="button"], [role="link"], tp-yt-paper-tab, yt-tab-shape',
                        )
                        const target = clickableParent || el
                        target.setAttribute("data-spacecode-click-target", "true")
                        return { success: true, text: getElText(target), tag: target.tagName.toLowerCase() }
                      }
                    }
                  }

                  // 3. Any visible element with contains match (prefer shortest innerText)
                  let bestEl: HTMLElement | null = null
                  let minLen = Infinity
                  for (const el of all) {
                    if (!isVisible(el)) continue
                    const txt = getElText(el).toLowerCase()
                    if (txt.includes(lowerQuery) && txt.length < minLen) {
                      minLen = txt.length
                      bestEl = el
                    }
                  }

                  if (bestEl) {
                    const clickableParent = (bestEl as HTMLElement).closest<HTMLElement>(
                      'button, a, [role="tab"], [role="button"], [role="link"], tp-yt-paper-tab, yt-tab-shape',
                    )
                    const target = clickableParent || bestEl
                    target.setAttribute("data-spacecode-click-target", "true")
                    return { success: true, text: getElText(target), tag: target.tagName.toLowerCase() }
                  }

                  return { success: false }
                }, query)

                if (!found || !found.success) {
                  throw new Error(
                    `Could not find clickable element matching text: "${query}". Try action: 'snapshot' to inspect visible elements.`,
                  )
                }

                try {
                  await executeRobustClick(page, { selector: '[data-spacecode-click-target="true"]' })
                  await new Promise((r) => setTimeout(r, 150))
                } finally {
                  await page
                    .evaluate(() => {
                      const cleanDeep = (root: Document | ShadowRoot | Element) => {
                        try {
                          root
                            .querySelectorAll('[data-spacecode-click-target="true"]')
                            .forEach((e) => e.removeAttribute("data-spacecode-click-target"))
                        } catch {}
                        try {
                          const allEls = Array.from(root.querySelectorAll<Element>("*"))
                          for (const el of allEls) {
                            if (el.shadowRoot) cleanDeep(el.shadowRoot)
                          }
                        } catch {}
                      }
                      cleanDeep(document)
                    })
                    .catch(() => {})
                }

                const activePage = await session.getActivePage()
                await activePage.bringToFront().catch(() => {})
                const postNotice = await session.checkSync(activePage, params.action)
                const currentUrl = activePage.url()
                const title = await activePage.title()

                const notice = postNotice || preNotice
                const prefix = notice ? notice + "\n\n" : ""

                return {
                  title: `Click text: "${params.text}"`,
                  metadata: { action: "click_text", text: params.text, url: currentUrl, pageTitle: title },
                  output: `${prefix}Clicked element "${found.text}" (<${found.tag}>). Page URL: ${currentUrl} (Title: "${title}").`,
                }
              }

              case "type": {
                const textToType = params.text ?? ""
                let target: ElementHandle<Element> | null = null

                if (params.target_id !== undefined) {
                  await executeRobustClick(page, { id: params.target_id }).catch(() => {})
                  target = session.getElement(params.target_id) || null
                  if (!target) {
                    let fresh = await page.$(`[data-spacecode-id="${params.target_id}"]`)
                    if (!fresh) {
                      fresh = await page.$(`pierce/[data-spacecode-id="${params.target_id}"]`).catch(() => null)
                    }
                    if (fresh) target = fresh
                  }
                  if (!target) {
                    throw new Error(
                      `Interactive element with target_id [${params.target_id}] not found. Run action: 'snapshot' to refresh element IDs.`,
                    )
                  }
                } else if (params.selector) {
                  await executeRobustClick(page, { selector: params.selector }).catch(() => {})
                  target = await page.$(params.selector)
                  if (!target) {
                    target = await page.$(`pierce/${params.selector}`).catch(() => null)
                  }
                  if (!target) {
                    throw new Error(`Element matching selector "${params.selector}" not found.`)
                  }
                }

                if (target) {
                  await new Promise((r) => setTimeout(r, 50))

                  // Check if this was a YouTube comment placeholder that reveals div#contenteditable-root
                  const contentEditableRoot = await page.$("div#contenteditable-root")
                  if (contentEditableRoot) {
                    const isFocusedOnRoot = await page.evaluate(() => {
                      const active = document.activeElement
                      return (
                        active?.id === "contenteditable-root" || active?.getAttribute("contenteditable") === "true"
                      )
                    })
                    if (!isFocusedOnRoot) {
                      await contentEditableRoot.click().catch(() => {})
                      await new Promise((r) => setTimeout(r, 50))
                    }
                  }

                  // High-speed typing with minimal 5ms delay for fast responsiveness
                  await page.keyboard.type(textToType, { delay: 5 })

                  const activePage = await session.getActivePage()
                  await activePage.bringToFront().catch(() => {})
                  const postNotice = await session.checkSync(activePage, params.action)
                  const notice = postNotice || preNotice
                  const prefix = notice ? notice + "\n\n" : ""

                  const targetDesc = params.target_id !== undefined ? `[${params.target_id}]` : `"${params.selector}"`
                  return {
                    title: `Type into ${targetDesc}`,
                    metadata: {
                      action: "type",
                      target_id: params.target_id,
                      selector: params.selector,
                      textLength: textToType.length,
                    },
                    output: `${prefix}Typed "${textToType}" into element ${targetDesc}.`,
                  }
                } else {
                  await page.keyboard.type(textToType, { delay: 5 })
                  const activePage = await session.getActivePage()
                  await activePage.bringToFront().catch(() => {})
                  const postNotice = await session.checkSync(activePage, params.action)
                  const notice = postNotice || preNotice
                  const prefix = notice ? notice + "\n\n" : ""

                  return {
                    title: `Type`,
                    metadata: { action: "type", textLength: textToType.length },
                    output: `${prefix}Typed "${textToType}" into focused element.`,
                  }
                }
              }

              case "key_press": {
                if (!params.key) {
                  throw new Error("'key' parameter is required for 'key_press' action (e.g. 'Enter', 'Tab', 'Escape').")
                }

                await page.keyboard.press(params.key as KeyInput)
                await new Promise((r) => setTimeout(r, 100))
                const activePage = await session.getActivePage()
                await activePage.bringToFront().catch(() => {})
                const postNotice = await session.checkSync(activePage, params.action)
                const currentUrl = activePage.url()

                const notice = postNotice || preNotice
                const prefix = notice ? notice + "\n\n" : ""

                return {
                  title: `Key: ${params.key}`,
                  metadata: { action: "key_press", key: params.key, url: currentUrl },
                  output: `${prefix}Pressed key "${params.key}". Current URL: ${currentUrl}`,
                }
              }

              case "scroll": {
                const direction = params.direction ?? "down"
                const amount = params.amount ?? 600

                await page.evaluate(
                  (dir, px) => {
                    window.scrollBy({
                      top: dir === "down" ? px : -px,
                      behavior: "smooth",
                    })
                  },
                  direction,
                  amount,
                )

                // Wait 250ms after scrolling for lazy-loaded DOM elements to paint
                await new Promise((r) => setTimeout(r, 250))

                const currentUrl = page.url()
                const title = await page.title()
                const scrollPos = await page
                  .evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
                  .catch(() => ({ x: 0, y: 0 }))

                return {
                  title: `Scroll ${direction} (${amount}px)`,
                  metadata: { action: "scroll", direction, amount, scrollY: scrollPos.y, url: currentUrl },
                  output: `Scrolled ${direction} by ${amount}px (current scrollY: ${scrollPos.y}px). Page: "${title}".`,
                }
              }

              case "wait": {
                const seconds = params.seconds ?? 2
                if (params.selector) {
                  try {
                    await page.waitForSelector(params.selector, { timeout: seconds * 1000 })
                  } catch {
                    // selector wait timed out, proceed
                  }
                } else {
                  await new Promise((r) => setTimeout(r, seconds * 1000))
                }

                const currentUrl = page.url()
                const title = await page.title()

                return {
                  title: `Wait (${seconds}s)`,
                  metadata: { action: "wait", seconds, selector: params.selector, url: currentUrl, pageTitle: title },
                  output: params.selector
                    ? `Waited up to ${seconds}s for selector "${params.selector}". Current page: "${title}".`
                    : `Waited for ${seconds} second(s). Current page: "${title}".`,
                }
              }

              case "list_tabs": {
                const browser = await session.getBrowser()
                const pages = (await browser.pages()).filter((p) => !p.isClosed())
                const tabList: Array<{ index: number; title: string; url: string; active: boolean }> = []

                for (let i = 0; i < pages.length; i++) {
                  const p = pages[i]
                  const title = await p.title().catch(() => "Untitled")
                  const url = p.url()
                  const active = await p.evaluate(() => document.visibilityState === "visible").catch(() => false)
                  tabList.push({ index: i, title, url, active })
                }

                if (!tabList.some((t) => t.active) && tabList.length > 0) {
                  tabList[tabList.length - 1].active = true
                }

                const lines = tabList.map(
                  (t) => `[${t.index}] ${t.active ? "* (Active) " : ""}"${t.title}" - ${t.url}`,
                )

                return {
                  title: `List Tabs (${tabList.length})`,
                  metadata: { action: "list_tabs", count: tabList.length, tabs: tabList },
                  output: `Open Tabs (${tabList.length}):\n${lines.join("\n")}`,
                }
              }

              case "new_tab": {
                const browser = await session.getBrowser()
                const newPage = await browser.newPage()
                await setupPageInterception(newPage)
                await newPage.bringToFront()

                let targetUrl = params.url ? params.url.trim() : ""
                if (targetUrl) {
                  if (
                    !/^https?:\/\//i.test(targetUrl) &&
                    !targetUrl.startsWith("about:") &&
                    !targetUrl.startsWith("file:") &&
                    !targetUrl.startsWith("data:")
                  ) {
                    targetUrl = "https://" + targetUrl
                  }
                  try {
                    await newPage.goto(targetUrl, {
                      waitUntil: "domcontentloaded",
                      timeout: 5000,
                    })
                  } catch (err: any) {
                    const currentUrl = newPage.url()
                    if (err?.message?.includes("Navigation timeout") || err?.name === "TimeoutError") {
                      if (currentUrl && currentUrl !== "about:blank") {
                        // Proceed with loaded DOM
                      } else {
                        throw err
                      }
                    } else {
                      throw err
                    }
                  }
                }

                await session.checkSync(newPage, params.action)
                const title = await newPage.title()
                const currentUrl = newPage.url()
                const pages = (await browser.pages()).filter((p) => !p.isClosed())
                const tabIndex = pages.indexOf(newPage)

                return {
                  title: `New Tab: ${title || currentUrl || "about:blank"}`,
                  metadata: { action: "new_tab", tab_index: tabIndex, url: currentUrl, pageTitle: title },
                  output: `Opened new tab [${tabIndex}] at ${currentUrl || "about:blank"} (Title: "${title}").`,
                }
              }

              case "switch_tab": {
                const browser = await session.getBrowser()
                const pages = (await browser.pages()).filter((p) => !p.isClosed())

                let targetPage: Page | undefined
                let targetIndex = -1

                if (params.tab_index !== undefined) {
                  if (params.tab_index < 0 || params.tab_index >= pages.length) {
                    throw new Error(
                      `Invalid tab_index: ${params.tab_index}. Open tab count: ${pages.length} (valid indices: 0 to ${pages.length - 1}).`,
                    )
                  }
                  targetPage = pages[params.tab_index]
                  targetIndex = params.tab_index
                } else if (params.tab_title) {
                  const query = params.tab_title.toLowerCase()
                  for (let i = 0; i < pages.length; i++) {
                    const p = pages[i]
                    const title = (await p.title().catch(() => "")).toLowerCase()
                    const url = p.url().toLowerCase()
                    if (title.includes(query) || url.includes(query)) {
                      targetPage = p
                      targetIndex = i
                      break
                    }
                  }
                  if (!targetPage) {
                    throw new Error(`No open tab found matching tab_title query: "${params.tab_title}".`)
                  }
                } else {
                  throw new Error("Missing tab target: specify 'tab_index' or 'tab_title' to switch tabs.")
                }

                await targetPage.bringToFront()
                await session.checkSync(targetPage, params.action)
                const title = await targetPage.title()
                const currentUrl = targetPage.url()

                return {
                  title: `Switch Tab [${targetIndex}]: ${title}`,
                  metadata: { action: "switch_tab", tab_index: targetIndex, url: currentUrl, pageTitle: title },
                  output: `Switched to tab [${targetIndex}]: "${title}" (${currentUrl}).`,
                }
              }

              case "close_tab": {
                const browser = await session.getBrowser()
                const pages = (await browser.pages()).filter((p) => !p.isClosed())

                if (pages.length === 0) {
                  throw new Error("No open tabs to close.")
                }

                let targetPage: Page
                let targetIndex = -1

                if (params.tab_index !== undefined) {
                  if (params.tab_index < 0 || params.tab_index >= pages.length) {
                    throw new Error(
                      `Invalid tab_index: ${params.tab_index}. Open tab count: ${pages.length} (valid indices: 0 to ${pages.length - 1}).`,
                    )
                  }
                  targetPage = pages[params.tab_index]
                  targetIndex = params.tab_index
                } else {
                  targetPage = await session.getActivePage()
                  targetIndex = pages.indexOf(targetPage)
                  if (targetIndex === -1) {
                    targetPage = pages[pages.length - 1]
                    targetIndex = pages.length - 1
                  }
                }

                const title = await targetPage.title().catch(() => "")
                const currentUrl = targetPage.url()
                await targetPage.close()

                const remainingPages = (await browser.pages()).filter((p) => !p.isClosed())
                if (remainingPages.length > 0) {
                  const nextActive = await session.getActivePage()
                  await nextActive.bringToFront().catch(() => {})
                  await session.checkSync(nextActive, params.action)
                }

                return {
                  title: `Closed Tab [${targetIndex}]`,
                  metadata: {
                    action: "close_tab",
                    closed_index: targetIndex,
                    url: currentUrl,
                    pageTitle: title,
                    remaining_count: remainingPages.length,
                  },
                  output: `Closed tab [${targetIndex}] ("${title}"). Remaining open tabs: ${remainingPages.length}.`,
                }
              }

              case "close": {
                await session.close()
                return {
                  title: "Browser Close",
                  metadata: { action: "close" },
                  output: "Browser session closed successfully.",
                }
              }

              default:
                throw new Error(`Unsupported browser action: ${(params as any).action}`)
            }
          })
        }),
    }
  }),
)
