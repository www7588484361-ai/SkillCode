<p align="center">
  <img src="skillcode-logo.png" alt="SkillCode Logo" width="120" style="border-radius: 24px;" />
</p>

# SkillCode

### The AI coding agent that actually does the work.

Controls browsers, inspects your code, and writes tested software right inside your terminal.

<p align="left">
  <a href="https://www.npmjs.com/package/@nexor009/skillcode"><img alt="npm" src="https://img.shields.io/npm/v/@nexor009/skillcode?style=flat-square&color=blue" /></a>
  <a href="https://github.com/www7588484361-ai/SkillCode"><img alt="License" src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" /></a>
  <a href="https://github.com/www7588484361-ai/SkillCode/issues"><img alt="Issues" src="https://img.shields.io/github/issues/www7588484361-ai/SkillCode?style=flat-square" /></a>
</p>

---

### Quick Start

Install SkillCode globally via npm:

```bash
npm install -g @nexor009/skillcode@1.0.0-beta.7
```

Or run directly without installing:

```bash
npx @nexor009/skillcode@1.0.0-beta.7
```

Navigate to any project directory and launch the cockpit:

```bash
skillcode
```

SkillCode instantly attaches to your project and launches the high-performance raw-mode terminal interface.

---

### Core Architecture & Capabilities

1. **Autonomous Browser Control**
   - Directly controls real Chromium instances via Puppeteer.
   - Interacts with local or remote web applications, takes screenshots, inspects console logs, and debugs frontend UI in real time.

2. **Real-Time Web Search & Docs Fetch**
   - Live pre-task search before writing code.
   - Automatically searches official documentation and fetches markdown via Exa/webfetch so you never get hallucinated APIs or deprecated syntax.

3. **Multi-Agent Architecture**
   - Work is delegated across 4 specialized internal subagents:
     - **Build**: Full development agent with file editing and execution permissions.
     - **Plan**: Deep read-only analysis and architecture roadmap without touching code.
     - **Explore**: Fast AST codebase indexing and search.
     - **Verify**: Autonomous test execution, linter verification, and bug discovery.

4. **Instant Undo & Safe Rollback**
   - Automatic local file snapshots before any edit.
   - If an AI modification introduces regressions, roll back safely with a single command.

---

### ⚡ Specialized Built-in Tools

SkillCode includes a high-performance native tool suite built for terminal speed and zero-breakage safety:

- 🕵️‍♂️ **`hide_and_seek`**: Multi-tier native OS filesystem search with recency ranking (`latest downloads`, `*.config`). Scans deep directory trees across entire drives in milliseconds and auto-ranks the freshest match `#1` to eliminate duplicate-file edits.
- ⚡ **`code-mode`**: Batch MCP tool execution via sandboxed JavaScript and `Promise.all()`. Executes complex multi-tool workflows in a single turn without wasting context tokens on repetitive LLM roundtrips.
- 🌐 **`browser`**: Zero-dependency host browser control (Chrome/Edge). Inspects live web apps via indexed accessibility trees, clicks elements, types input, captures screenshots, and tests frontends directly from your terminal.
- 🗺️ **`repo_map` & `symbol_slice`**: AST code graph mapping using Tree-sitter + Personalized PageRank. Understands large architectures and cross-file type contracts within a strict 1,024-token budget.
- 🛡️ **`syntax` & `apply_patch`**: Pre-commit AST syntax validation (via native transpilers) and multi-file atomic edits with automated Git checkpoints for instant zero-loss rollbacks.

---

### Key Commands & Shortcuts

| Key / Command | Action |
| --- | --- |
| `Tab` | Switch between active working modes (`build` / `plan`) |
| `/` | Open slash commands and tools menu |
| `Ctrl+P` | Fuzzy search and attach project files |
| `Esc` | Cancel running tool or agent step |

---

### License

SkillCode is free and open-source under the [MIT License](LICENSE).
