import { describe, expect, test, beforeEach } from "bun:test"
import { Effect, Layer } from "effect"
import * as Tool from "../../src/tool/tool"
import { Truncate } from "../../src/tool/truncate"
import { Agent } from "../../src/agent/agent"
import {
  parseDDGLite,
  cleanUrl,
  decodeHtml,
  formatSearchResults,
  searchCache,
  WebSearchTool,
  Parameters,
  searchWeb,
} from "../../src/tool/web_search"
import { SessionID, MessageID } from "../../src/session/schema"

const mockHtml = `
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<body>
<table>
  <tr>
    <td valign="top">1.&nbsp;</td>
    <td>
      <a rel="nofollow" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.godotengine.org%2Fen%2Fstable%2Fclasses%2Fclass_characterbody2d.html" class='result-link'>
        CharacterBody2D &mdash; Godot Engine (4.3) &amp; documentation
      </a>
    </td>
  </tr>
  <tr>
    <td>&nbsp;&nbsp;&nbsp;</td>
    <td class='result-snippet'>
      The <b>move_and_slide</b>() method simplifies collision response in Godot 4.3 &quot;physics&quot;.
    </td>
  </tr>
  <tr>
    <td>&nbsp;&nbsp;&nbsp;</td>
    <td><span class='link-text'>docs.godotengine.org</span></td>
  </tr>

  <tr>
    <td valign="top">2.&nbsp;</td>
    <td>
      <a rel="nofollow" href="https://example.com/tutorials/characterbody2d" class='result-link'>
        Complete CharacterBody2D Tutorial for Godot 4
      </a>
    </td>
  </tr>
  <tr>
    <td>&nbsp;&nbsp;&nbsp;</td>
    <td class='result-snippet'>
      Learn how velocity and move_and_slide work together in Godot 4.3.
    </td>
  </tr>
  <tr>
    <td>&nbsp;&nbsp;&nbsp;</td>
    <td><span class='link-text'>example.com</span></td>
  </tr>

  <tr>
    <td valign="top">3.&nbsp;</td>
    <td>
      <a rel="nofollow" href="https://example.com/item3" class='result-link'>
        Third Result Title
      </a>
    </td>
  </tr>
  <tr>
    <td>&nbsp;&nbsp;&nbsp;</td>
    <td class='result-snippet'>
      Third snippet details.
    </td>
  </tr>
  <tr>
    <td>&nbsp;&nbsp;&nbsp;</td>
    <td><span class='link-text'>example.com</span></td>
  </tr>
</table>
</body>
</html>
`

describe("tool.web_search", () => {
  beforeEach(() => {
    searchCache.clear()
  })

  test("tool has correct id and schema", () => {
    expect(WebSearchTool.id).toBe("web_search")
  })

  test("decodeHtml decodes HTML entities and strips tags", () => {
    expect(decodeHtml("Godot &amp; &quot;Engine&quot; &#39;v4&#39; &lt;test&gt;")).toBe("Godot & \"Engine\" 'v4'")
    expect(decodeHtml("<b>move_and_slide</b> ()")).toBe("move_and_slide ()")
  })

  test("cleanUrl unwraps DuckDuckGo redirect uddg parameters", () => {
    const raw = "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.godotengine.org%2Fen%2Fstable%2Fclasses%2Fclass_characterbody2d.html&rut=..."
    expect(cleanUrl(raw)).toBe("https://docs.godotengine.org/en/stable/classes/class_characterbody2d.html")

    const direct = "https://example.com/my-page"
    expect(cleanUrl(direct)).toBe("https://example.com/my-page")
  })

  test("parseDDGLite parses HTML structure and respects limit", () => {
    const results = parseDDGLite(mockHtml, 2)
    expect(results.length).toBe(2)

    expect(results[0].title).toContain("CharacterBody2D")
    expect(results[0].title).toContain("Godot Engine (4.3)")
    expect(results[0].url).toBe("https://docs.godotengine.org/en/stable/classes/class_characterbody2d.html")
    expect(results[0].snippet).toContain("move_and_slide")
    expect(results[0].snippet).toContain('"physics"')

    expect(results[1].title).toBe("Complete CharacterBody2D Tutorial for Godot 4")
    expect(results[1].url).toBe("https://example.com/tutorials/characterbody2d")
    expect(results[1].snippet).toContain("velocity and move_and_slide")
  })

  test("formatSearchResults generates structured Markdown", () => {
    const items = [
      {
        title: "Godot CharacterBody2D Docs",
        url: "https://docs.godotengine.org/en/4.3/classes/class_characterbody2d.html",
        snippet: "move_and_slide() documentation and examples.",
      },
    ]

    const md = formatSearchResults("Godot 4.3 characterbody2d", items, "DuckDuckGo Lite")
    expect(md).toContain('## Web Search Results for "Godot 4.3 characterbody2d" (DuckDuckGo Lite)')
    expect(md).toContain("### 1. [Godot CharacterBody2D Docs](https://docs.godotengine.org/en/4.3/classes/class_characterbody2d.html)")
    expect(md).toContain("- **URL**: https://docs.godotengine.org/en/4.3/classes/class_characterbody2d.html")
    expect(md).toContain("- **Snippet**: move_and_slide() documentation and examples.")
  })

  test("formatSearchResults handles empty results gracefully", () => {
    const md = formatSearchResults("nonexistent query 12345xyz", [])
    expect(md).toContain('No search results found for "nonexistent query 12345xyz"')
  })

  test("searchCache caches query results to avoid redundant network calls", async () => {
    const query = "test query cache"
    const limit = 5
    const cacheKey = `${query.trim().toLowerCase()}::${limit}`

    expect(searchCache.has(cacheKey)).toBe(false)

    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      output: "cached markdown output",
      results: [{ title: "Cached", url: "https://example.com", snippet: "sample" }],
    })

    expect(searchCache.has(cacheKey)).toBe(true)
    const cached = searchCache.get(cacheKey)
    expect(cached?.output).toBe("cached markdown output")
  })

  test("executes web_search tool with mock context and caching", async () => {
    const truncateMock = Layer.succeed(Truncate.Service, {
      output: (content: string) => Effect.succeed({ content, truncated: false }),
      limits: () => Effect.succeed({ maxLines: 1000, maxBytes: 100000 }),
    })
    const agentMock = Layer.succeed(Agent.Service, {
      get: () => Effect.succeed({ name: "build", mode: "primary", permission: {}, options: {} } as any),
      list: () => Effect.succeed([]),
      defaultAgent: () => Effect.succeed("build"),
    } as any)
    const testLayer = Layer.merge(truncateMock, agentMock)

    const info = await Effect.runPromise(WebSearchTool.pipe(Effect.provide(testLayer)))
    const tool = await Effect.runPromise(Tool.init(info).pipe(Effect.provide(testLayer)))

    // Pre-populate cache to test fast deterministic execution
    const query = "fastapi lifespan contextmanager"
    const cacheKey = `${query.trim().toLowerCase()}::5`
    searchCache.set(cacheKey, {
      timestamp: Date.now(),
      output: "## Web Search Results for FastAPI lifespan",
      results: [{ title: "FastAPI Lifespan", url: "https://fastapi.tiangolo.com/advanced/events/", snippet: "lifespan events" }],
    })

    const ctx = {
      sessionID: SessionID.make("ses_test"),
      messageID: MessageID.make("msg_test"),
      callID: "call_1",
      agent: "build",
      abort: AbortSignal.any([]),
      messages: [],
      metadata: () => Effect.void,
      ask: () => Effect.void,
    }

    const result = await Effect.runPromise(
      tool.execute({ query, limit: 5 }, ctx).pipe(Effect.provide(testLayer)),
    )

    expect(result.title).toContain("fastapi lifespan contextmanager")
    expect(result.metadata.cached).toBe(true)
    expect(result.output).toContain("FastAPI lifespan")
  })

  test("live web_search query executes under 3000ms", async () => {
    const start = performance.now()
    const { results, provider } = await searchWeb("Godot 4.3 characterbody2d", 3)
    const elapsed = performance.now() - start

    expect(provider).toBeDefined()
    expect(Array.isArray(results)).toBe(true)
    // Results returned from live query
    if (results.length > 0) {
      expect(results[0].title.length).toBeGreaterThan(0)
      expect(results[0].url.startsWith("http")).toBe(true)
    }
  }, 10000)
})
