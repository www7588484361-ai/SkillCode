# @nexor009/skillcode

The AI coding agent that actually does the work. Controls browsers, inspects your code, and writes tested software right inside your terminal.

## Installation

```bash
npm install -g @nexor009/skillcode
```

## Usage

```bash
skillcode
```

## ⚡ Specialized Built-in Tools

SkillCode is powered by a high-performance native tool suite built for terminal speed and zero-breakage safety:

- 🕵️‍♂️ **`hide_and_seek`**: Multi-tier native OS filesystem search with recency ranking (`latest downloads`, `*.config`). Scans deep directory trees across entire drives in milliseconds and auto-ranks the freshest match `#1` to eliminate duplicate-file edits.
- ⚡ **`code-mode`**: Batch MCP tool execution via sandboxed JavaScript and `Promise.all()`. Executes complex multi-tool workflows in a single turn without wasting context tokens on repetitive LLM roundtrips.
- 🌐 **`browser`**: Zero-dependency host browser control (Chrome/Edge). Inspects live web apps via indexed accessibility trees, clicks elements, types input, captures screenshots, and tests frontends directly from your terminal.
- 🗺️ **`repo_map` & `symbol_slice`**: AST code graph mapping using Tree-sitter + Personalized PageRank. Understands large architectures and cross-file type contracts within a strict 1,024-token budget.
- 🛡️ **`syntax` & `apply_patch`**: Pre-commit AST syntax validation (via native transpilers) and multi-file atomic edits with automated Git checkpoints for instant zero-loss rollbacks.

## Development

```bash
bun install
bun dev
```

## License

MIT © [SkillCode Contributors](https://github.com/www7588484361-ai/SkillCode)
