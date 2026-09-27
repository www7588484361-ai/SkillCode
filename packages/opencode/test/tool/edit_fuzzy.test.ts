import { describe, it, expect } from "bun:test"
import {
  replace,
  replaceWithEllipsis,
  parseSearchReplaceBlocks,
  findSimilarLines,
  DotDotDotReplacer,
  FuzzySequenceReplacer,
} from "../../src/tool/edit"

describe("edit tool - Aider fuzzy & SEARCH/REPLACE superpowers", () => {
  describe("parseSearchReplaceBlocks", () => {
    it("extracts search and replace blocks from aider diff format", () => {
      const input = `
<<<<<<< SEARCH
def hello():
    print("old")
=======
def hello():
    print("new")
>>>>>>> REPLACE
`
      const blocks = parseSearchReplaceBlocks(input)
      expect(blocks.length).toBe(1)
      expect(blocks[0].search.trim()).toBe('def hello():\n    print("old")')
      expect(blocks[0].replace.trim()).toBe('def hello():\n    print("new")')
    })

    it("extracts multiple sequential blocks", () => {
      const input = `
<<<<<<< SEARCH
const a = 1
=======
const a = 10
>>>>>>> REPLACE

Some text in between

<<<<<<< SEARCH
const b = 2
=======
const b = 20
>>>>>>> REPLACE
`
      const blocks = parseSearchReplaceBlocks(input)
      expect(blocks.length).toBe(2)
      expect(blocks[0].search.trim()).toBe("const a = 1")
      expect(blocks[0].replace.trim()).toBe("const a = 10")
      expect(blocks[1].search.trim()).toBe("const b = 2")
      expect(blocks[1].replace.trim()).toBe("const b = 20")
    })
  })

  describe("ellipsis elision (... in search and replace)", () => {
    it("preserves untouched middle lines when both oldString and newString use ...", () => {
      const content = `
function calculate() {
  const x = 10
  // lots of unchanged complex code
  const y = 20
  const z = 30
  return x + y + z
}
`
      const oldStr = `
function calculate() {
  const x = 10
  ...
  return x + y + z
}
`
      const newStr = `
function calculate() {
  const x = 99
  ...
  return x + y + z + 100
}
`
      const res = replace(content, oldStr, newStr)
      expect(res).toContain("const x = 99")
      expect(res).toContain("// lots of unchanged complex code")
      expect(res).toContain("const y = 20")
      expect(res).toContain("return x + y + z + 100")
    })

    it("replaces entire block when oldString has ... but newString does not", () => {
      const content = `
// header
class Service {
  start() {
    log("starting")
    init()
  }
}
// footer
`
      const oldStr = `
class Service {
  ...
}
`
      const newStr = `
class Service {
  start() { log("rebuilt"); }
}
`
      const res = replace(content, oldStr, newStr)
      expect(res).toContain('start() { log("rebuilt"); }')
      expect(res).not.toContain('log("starting")')
    })
  })

  describe("fuzzy sequence matching", () => {
    it("matches when whitespace slightly shifts across lines", () => {
      const content = `
function computeTotal(items) {
  let sum = 0;
  for (const item of items) {
    sum += item.price;
  }
  return sum;
}
`
      // Search has slightly different spacing
      const oldStr = `
function computeTotal(items) {
  let sum = 0;
   for (const item of items) {
     sum += item.price;
   }
  return sum;
}
`
      const newStr = `
function computeTotal(items) {
  return items.reduce((acc, item) => acc + item.price, 0);
}
`
      const res = replace(content, oldStr, newStr)
      expect(res).toContain("return items.reduce")
    })
  })

  describe("similar lines diagnostic suggestions", () => {
    it("suggests closest matching lines when oldString fails to match", () => {
      const content = `
export const API_URL = "https://api.example.com"
export const TIMEOUT = 5000
export const RETRIES = 3
`
      const badSearch = `
export const ENDPOINT_URL = "https://completely.different.domain.io"
export const TIMEOUT = 5000
`
      expect(() => replace(content, badSearch, "replacement")).toThrow(
        /Did you mean to match these lines in the file\?/,
      )
    })
  })
})
