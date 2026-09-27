import { Config } from "effect"

// SpaceCode rebrand: SPACECODE_* is preferred; OPENCODE_* is honored as a
// backward-compatible fallback so existing shells, tests, and tooling keep
// working without changes.
function legacyKey(key: string) {
  return key.startsWith("SPACECODE_") ? `OPENCODE_${key.slice("SPACECODE_".length)}` : key
}

function pick(key: string) {
  return process.env[key] ?? process.env[legacyKey(key)]
}

export function truthy(key: string) {
  const value = pick(key)?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = (process.env["SPACECODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"] ?? process.env["OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"])
const fff = (process.env["SPACECODE_DISABLE_FFF"] ?? process.env["OPENCODE_DISABLE_FFF"])

function enabledByExperimental(key: string) {
  const legacy = legacyKey(key)
  const raw = process.env[key] ?? process.env[legacy]
  if (raw === undefined) return truthy("SPACECODE_EXPERIMENTAL") || truthy("OPENCODE_EXPERIMENTAL")
  return truthy(key) || truthy(legacy)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  SPACECODE_AUTO_HEAP_SNAPSHOT: truthy("SPACECODE_AUTO_HEAP_SNAPSHOT"),
  SPACECODE_GIT_BASH_PATH: (process.env["SPACECODE_GIT_BASH_PATH"] ?? process.env["OPENCODE_GIT_BASH_PATH"]),
  SPACECODE_CONFIG: (process.env["SPACECODE_CONFIG"] ?? process.env["OPENCODE_CONFIG"]),
  SPACECODE_CONFIG_CONTENT: (process.env["SPACECODE_CONFIG_CONTENT"] ?? process.env["OPENCODE_CONFIG_CONTENT"]),
  SPACECODE_DISABLE_AUTOUPDATE: truthy("SPACECODE_DISABLE_AUTOUPDATE"),
  SPACECODE_ALWAYS_NOTIFY_UPDATE: truthy("SPACECODE_ALWAYS_NOTIFY_UPDATE"),
  SPACECODE_DISABLE_PRUNE: truthy("SPACECODE_DISABLE_PRUNE"),
  SPACECODE_DISABLE_TERMINAL_TITLE: truthy("SPACECODE_DISABLE_TERMINAL_TITLE"),
  SPACECODE_SHOW_TTFD: truthy("SPACECODE_SHOW_TTFD"),
  SPACECODE_DISABLE_AUTOCOMPACT: truthy("SPACECODE_DISABLE_AUTOCOMPACT"),
  SPACECODE_DISABLE_MODELS_FETCH: truthy("SPACECODE_DISABLE_MODELS_FETCH"),
  SPACECODE_DISABLE_MOUSE: truthy("SPACECODE_DISABLE_MOUSE"),
  SPACECODE_FAKE_VCS: (process.env["SPACECODE_FAKE_VCS"] ?? process.env["OPENCODE_FAKE_VCS"]),
  SPACECODE_SERVER_PASSWORD: (process.env["SPACECODE_SERVER_PASSWORD"] ?? process.env["OPENCODE_SERVER_PASSWORD"]),
  SPACECODE_SERVER_USERNAME: (process.env["SPACECODE_SERVER_USERNAME"] ?? process.env["OPENCODE_SERVER_USERNAME"]),
  SPACECODE_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("SPACECODE_DISABLE_FFF"),

  // Experimental
  SPACECODE_EXPERIMENTAL_FILEWATCHER: Config.boolean("SPACECODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.orElse(() => Config.boolean("OPENCODE_EXPERIMENTAL_FILEWATCHER")),
    Config.withDefault(false),
  ),
  SPACECODE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("SPACECODE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.orElse(() => Config.boolean("OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER")),
    Config.withDefault(false),
  ),
  SPACECODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("SPACECODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  SPACECODE_MODELS_URL: (process.env["SPACECODE_MODELS_URL"] ?? process.env["OPENCODE_MODELS_URL"]),
  SPACECODE_MODELS_PATH: (process.env["SPACECODE_MODELS_PATH"] ?? process.env["OPENCODE_MODELS_PATH"]),
  SPACECODE_DB: (process.env["SPACECODE_DB"] ?? process.env["OPENCODE_DB"]),

  SPACECODE_WORKSPACE_ID: (process.env["SPACECODE_WORKSPACE_ID"] ?? process.env["OPENCODE_WORKSPACE_ID"]),
  SPACECODE_EXPERIMENTAL_WORKSPACES: enabledByExperimental("SPACECODE_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get SPACECODE_DISABLE_PROJECT_CONFIG() {
    return truthy("SPACECODE_DISABLE_PROJECT_CONFIG")
  },
  get SPACECODE_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("SPACECODE_EXPERIMENTAL_REFERENCES")
  },
  get SPACECODE_TUI_CONFIG() {
    return (process.env["SPACECODE_TUI_CONFIG"] ?? process.env["OPENCODE_TUI_CONFIG"])
  },
  get SPACECODE_CONFIG_DIR() {
    return (process.env["SPACECODE_CONFIG_DIR"] ?? process.env["OPENCODE_CONFIG_DIR"])
  },
  get SPACECODE_PURE() {
    return truthy("SPACECODE_PURE")
  },
  get SPACECODE_PERMISSION() {
    return (process.env["SPACECODE_PERMISSION"] ?? process.env["OPENCODE_PERMISSION"])
  },
  get SPACECODE_PLUGIN_META_FILE() {
    return (process.env["SPACECODE_PLUGIN_META_FILE"] ?? process.env["OPENCODE_PLUGIN_META_FILE"])
  },
  get SPACECODE_CLIENT() {
    return (process.env["SPACECODE_CLIENT"] ?? process.env["OPENCODE_CLIENT"]) ?? "cli"
  },
}
