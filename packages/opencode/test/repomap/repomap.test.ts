import { describe, it, expect } from "bun:test"
import { extractTags } from "../../src/repomap/tag"
import { rankTags } from "../../src/repomap/graph"
import { renderRepoMap } from "../../src/repomap/renderer"

describe("RepoMap Engine - Aider Tree-sitter & PageRank Superpower", () => {
  describe("extractTags", () => {
    it("extracts TypeScript functions, classes, interfaces, types, and references", () => {
      const tsCode = `
export interface User {
  id: string;
  name: string;
}

export class UserService {
  getUser(id: string): User {
    return Database.find(id);
  }
}

export async function authenticate(creds: Credentials): Promise<boolean> {
  const service = new UserService();
  return service.getUser("1") !== null;
}
`
      const tags = extractTags(tsCode, "/app/user.ts", "user.ts")
      const defs = tags.filter((t) => t.kind === "def").map((t) => t.name)
      const refs = tags.filter((t) => t.kind === "ref").map((t) => t.name)

      expect(defs).toContain("User")
      expect(defs).toContain("UserService")
      expect(defs).toContain("authenticate")

      expect(refs).toContain("Database")
      expect(refs).toContain("UserService")
    })

    it("extracts Python classes and functions", () => {
      const pyCode = `
class Repository:
    def __init__(self, path):
        self.path = path

    def get_commit(self, sha):
        return GitRunner.execute(sha)

def build_repo(url):
    repo = Repository(url)
    return repo
`
      const tags = extractTags(pyCode, "/app/repo.py", "repo.py")
      const defs = tags.filter((t) => t.kind === "def").map((t) => t.name)
      const refs = tags.filter((t) => t.kind === "ref").map((t) => t.name)

      expect(defs).toContain("Repository")
      expect(defs).toContain("get_commit")
      expect(defs).toContain("build_repo")

      expect(refs).toContain("GitRunner")
      expect(refs).toContain("Repository")
    })
  })

  describe("rankTags & PageRank", () => {
    it("ranks referenced definitions higher than isolated ones", () => {
      // File A defines AuthClient, File B and C reference AuthClient
      const tagsA = extractTags(
        `export class AuthClient { login() {} }`,
        "/app/auth.ts",
        "auth.ts",
      )
      const tagsB = extractTags(
        `import { AuthClient } from './auth'; const client = new AuthClient();`,
        "/app/login.ts",
        "login.ts",
      )
      const tagsC = extractTags(
        `export class IsolatedHelper { ping() {} }`,
        "/app/helper.ts",
        "helper.ts",
      )

      const tagsByFile = new Map([
        ["auth.ts", tagsA],
        ["login.ts", tagsB],
        ["helper.ts", tagsC],
      ])

      const ranked = rankTags(tagsByFile, {
        chatFiles: ["login.ts"],
      })

      expect(ranked.length).toBeGreaterThanOrEqual(1)
      // AuthClient should be at the top because login.ts (chat file) references it
      const topTag = ranked[0]
      expect(topTag.tag.name).toBe("AuthClient")
    })
  })

  describe("renderRepoMap", () => {
    it("renders code skeleton with file paths and definition lines within budget", () => {
      const codeA = `export class Engine {\n  start() {\n    init();\n  }\n}`
      const tagsA = extractTags(codeA, "/app/engine.ts", "engine.ts")
      const tagsByFile = new Map([["engine.ts", tagsA]])
      const fileContents = new Map([["engine.ts", codeA]])

      const ranked = rankTags(tagsByFile)
      const output = renderRepoMap(ranked, { maxTokens: 500, fileContents })

      expect(output).toContain("engine.ts:")
      expect(output).toContain("export class Engine")
      // Does not contain full function body
      expect(output).not.toContain("init();")
    })
  })
})
