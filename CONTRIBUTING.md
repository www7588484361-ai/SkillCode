# Contributing to SkillCode

We want to make it easy for you to contribute to SkillCode. Here are the most common types of changes that get merged:

- Bug fixes
- Additional LSPs / Formatters
- Improvements to LLM performance
- Support for new providers
- Fixes for environment-specific quirks
- Missing standard behavior
- Documentation improvements

However, any UI or core product feature must go through a design review with the core team before implementation.

If you are unsure if a PR would be accepted, feel free to ask a maintainer or look for issues on GitHub:
- [SkillCode Issues](https://github.com/www7588484361-ai/SkillCode/issues)

> [!NOTE]
> PRs that ignore these guardrails will likely be closed.

## Developing SkillCode

- Requirements: Bun 1.3+
- Install dependencies and start the dev server from the repo root:

  ```bash
  bun install
  bun dev
  ```

### Running against a different directory

By default, `bun dev` runs SkillCode in the `packages/opencode` directory. To run it against a different directory or repository:

```bash
bun dev <directory>
```

To run SkillCode in the root of the repo itself:

```bash
bun dev .
```

### Building standalone binaries

To compile a standalone executable:

```bash
./packages/opencode/script/build.ts --single
```

Then run it with:

```bash
./packages/opencode/dist/skillcode-<platform>/bin/skillcode
```

- Core pieces:
  - `packages/opencode`: SkillCode core business logic, agent orchestration, and server.
  - `packages/opencode/src/cli/cmd/tui/`: The TUI code, written in SolidJS with [opentui](https://github.com/sst/opentui)
  - `packages/app`: The shared web UI components, written in SolidJS
  - `packages/desktop`: The native desktop app, built with Electron (wraps `packages/app`)
  - `packages/plugin`: Source for plugin ecosystem

### Understanding bun dev vs skillcode

During development, `bun dev` is the local equivalent of the built `skillcode` command. Both run the same CLI interface:

```bash
# Development (from project root)
bun dev --help           # Show all available commands
bun dev serve            # Start headless API server
bun dev web              # Start server + open web interface
bun dev <directory>      # Start TUI in specific directory

# Production
skillcode --help         # Show all available commands
skillcode serve          # Start headless API server
skillcode web            # Start server + open web interface
skillcode <directory>    # Start TUI in specific directory
```

### Running the API Server

To start the SkillCode headless API server:

```bash
bun dev serve
```

This starts the headless server on port 4096 by default. You can specify a different port:

```bash
bun dev serve --port 8080
```

### Running the Web App

To test UI changes during development:

1. **First, start the SkillCode server** (see [Running the API Server](#running-the-api-server) section above)
2. **Then run the web app:**

```bash
bun run --cwd packages/app dev
```

### Running the Desktop App

The desktop app is an Electron application that wraps the web UI.

To run the desktop app in development:

```bash
bun run --cwd packages/desktop dev
```

To create a production build and package the app:

```bash
bun run --cwd packages/desktop build
bun run --cwd packages/desktop package
```

### Pull Request Expectations

### Issue First Policy

**All PRs must reference an existing issue.** Before opening a PR, open an issue describing the bug or feature. This helps maintainers triage and prevents duplicate work. PRs without a linked issue may be closed without review.

- Use `Fixes #123` or `Closes #123` in your PR description to link the issue
- For small fixes, a brief issue is fine - just enough context for maintainers to understand the problem

### General Requirements

- Keep pull requests small and focused
- Explain the issue and why your change fixes it
- Before adding new functionality, ensure it doesn't already exist elsewhere in the codebase

### UI Changes

If your PR includes UI changes, please include screenshots or videos showing the before and after.

### PR Titles

PR titles should follow conventional commit standards:

- `feat:` new feature or functionality
- `fix:` bug fix
- `docs:` documentation or README changes
- `chore:` maintenance tasks, dependency updates, etc.
- `refactor:` code refactoring without changing behavior
- `test:` adding or updating tests

Examples:

- `docs: update contributing guidelines`
- `fix: resolve crash on startup`
- `feat: add browser automation tool`

## License

SkillCode is free and open-source under the [MIT License](LICENSE).
