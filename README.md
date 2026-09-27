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
npm install -g @nexor009/skillcode
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
