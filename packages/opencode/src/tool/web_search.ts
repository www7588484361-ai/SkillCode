import { Effect, Schema } from "effect"
import * as Tool from "./tool"

export interface SearchResultItem {
  title: string
  url: string
  snippet: string
}

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "The search query (e.g., 'Godot 4.3 characterbody2d move_and_slide syntax', 'FastAPI lifespan event handler example').",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Number of search results to return (default: 5, maximum: 10).",
  }),
})

export interface CachedSearch {
  timestamp: number
  output: string
  results: SearchResultItem[]
}

// In-memory cache for fast search queries
export const searchCache = new Map<string, CachedSearch>()
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const MAX_CACHE_SIZE = 500

export function decodeHtml(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim()
}

export function cleanUrl(href: string): string {
  if (href.startsWith("//")) {
    href = `https:${href}`
  }
  if (href.includes("duckduckgo.com/l/?") || href.includes("/l/?")) {
    const match = href.match(/[?&]uddg=([^&]+)/)
    if (match) {
      try {
        return decodeURIComponent(match[1])
      } catch {
        // ignore decode failure
      }
    }
  }
  return href
}

export function parseDDGLite(html: string, limit = 5): SearchResultItem[] {
  const linkRegex = /<a\s+[^>]*class=['"][^'"]*result-link[^'"]*['"][^>]*>([\s\S]*?)<\/a>/gi
  const hrefRegex = /href=['"]([^'"]+)['"]/i
  const snippetRegex = /<td\s+[^>]*class=['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]*?)<\/td>/gi

  const links: { title: string; url: string }[] = []
  let m: RegExpExecArray | null
  while ((m = linkRegex.exec(html)) !== null) {
    const fullTag = m[0]
    const textContent = m[1]
    const hrefMatch = fullTag.match(hrefRegex)
    if (hrefMatch) {
      links.push({
        url: cleanUrl(hrefMatch[1]),
        title: decodeHtml(textContent),
      })
    }
  }

  const snippets: string[] = []
  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push(decodeHtml(m[1]))
  }

  const results: SearchResultItem[] = []
  const count = Math.min(links.length, limit)
  for (let i = 0; i < count; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || "",
    })
  }

  return results
}

async function searchBrave(query: string, apiKey: string, limit: number): Promise<SearchResultItem[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`
  const res = await fetch(url, {
    headers: {
      "X-Subscription-Token": apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    throw new Error(`Brave Search returned status ${res.status}`)
  }
  const data = (await res.json()) as any
  const webResults = data?.web?.results || []
  return webResults.slice(0, limit).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.description || "",
  }))
}

async function searchTavily(query: string, apiKey: string, limit: number): Promise<SearchResultItem[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: limit,
    }),
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    throw new Error(`Tavily Search returned status ${res.status}`)
  }
  const data = (await res.json()) as any
  const results = data?.results || []
  return results.slice(0, limit).map((r: any) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.content || "",
  }))
}

async function searchDDGLiteFetch(query: string, limit: number): Promise<SearchResultItem[]> {
  const res = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) {
    throw new Error(`DuckDuckGo Lite returned status ${res.status}`)
  }
  const html = await res.text()
  return parseDDGLite(html, limit)
}

export async function searchWeb(
  query: string,
  limit = 5,
): Promise<{ results: SearchResultItem[]; provider: string }> {
  const clampedLimit = Math.max(1, Math.min(10, limit))

  // 1. Try Brave Search if API key exists
  if (process.env.BRAVE_API_KEY) {
    try {
      const results = await searchBrave(query, process.env.BRAVE_API_KEY, clampedLimit)
      if (results.length > 0) {
        return { results, provider: "Brave Search" }
      }
    } catch {
      // Fallback
    }
  }

  // 2. Try Tavily Search if API key exists
  if (process.env.TAVILY_API_KEY) {
    try {
      const results = await searchTavily(query, process.env.TAVILY_API_KEY, clampedLimit)
      if (results.length > 0) {
        return { results, provider: "Tavily Search" }
      }
    } catch {
      // Fallback
    }
  }

  // 3. Zero-dependency DuckDuckGo Lite parser (fast & reliable)
  try {
    const results = await searchDDGLiteFetch(query, clampedLimit)
    if (results.length > 0) {
      return { results, provider: "DuckDuckGo Lite" }
    }
  } catch {
    // Fallback
  }

  return { results: [], provider: "none" }
}

export function formatSearchResults(query: string, results: SearchResultItem[], provider?: string): string {
  if (results.length === 0) {
    return `No search results found for "${query}". Try refining your search query.`
  }

  const lines: string[] = [
    `## Web Search Results for "${query}"${provider ? ` (${provider})` : ""}`,
    "",
  ]

  results.forEach((item, index) => {
    lines.push(`### ${index + 1}. [${item.title || item.url}](${item.url})`)
    lines.push(`- **URL**: ${item.url}`)
    if (item.snippet) {
      lines.push(`- **Snippet**: ${item.snippet}`)
    }
    lines.push("")
  })

  return lines.join("\n").trim()
}

export const WebSearchTool = Tool.define(
  "web_search",
  Effect.gen(function* () {
    return {
      description:
        "Perform a lightning-fast native web search for official documentation, API references, library versions, and programming patterns. Returns concise titles, URLs, and code snippets without opening heavy browsers. Use before coding unfamiliar libraries or modern frameworks to verify latest syntax.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const limit = Math.max(1, Math.min(10, params.limit ?? 5))
          const cacheKey = `${params.query.trim().toLowerCase()}::${limit}`
          const now = Date.now()

          // Check cache
          const cached = searchCache.get(cacheKey)
          if (cached && now - cached.timestamp < CACHE_TTL_MS) {
            yield* ctx.metadata({
              title: `Web search (cached): "${params.query}" (${cached.results.length} results)`,
              metadata: { query: params.query, count: cached.results.length, cached: true },
            })
            return {
              title: `Web search: "${params.query}"`,
              metadata: { query: params.query, count: cached.results.length, cached: true },
              output: cached.output,
            }
          }

          yield* ctx.ask({
            permission: "web_search",
            patterns: [params.query],
            always: ["*"],
            metadata: { query: params.query, limit },
          })

          yield* ctx.metadata({
            title: `Searching web for "${params.query}"...`,
            metadata: { query: params.query },
          })

          const searchRes = yield* Effect.tryPromise({
            try: () => searchWeb(params.query, limit),
            catch: (err) => new Error(`Web search failed: ${err instanceof Error ? err.message : String(err)}`),
          })

          const output = formatSearchResults(params.query, searchRes.results, searchRes.provider)

          // Store in cache
          if (searchCache.size >= MAX_CACHE_SIZE) {
            const oldestKey = searchCache.keys().next().value
            if (oldestKey) searchCache.delete(oldestKey)
          }
          searchCache.set(cacheKey, {
            timestamp: now,
            output,
            results: searchRes.results,
          })

          return {
            title: `Web search: "${params.query}" (${searchRes.results.length} results)`,
            metadata: {
              query: params.query,
              count: searchRes.results.length,
              provider: searchRes.provider,
            },
            output,
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters>
  }),
)
