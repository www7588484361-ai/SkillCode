import { createMemo, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { useKV } from "../../context/kv"
import { useDirectory } from "../../context/directory"
import { useConnected } from "../../component/use-connected"
import { createStore } from "solid-js/store"
import { useRoute } from "../../context/route"
import { RGBA, TextAttributes } from "@opentui/core"

export function Footer() {
  const { theme } = useTheme()
  const sync = useSync()
  const kv = useKV()
  const [autoApprove] = kv.signal("auto_approve", false)
  const route = useRoute()
  const mcp = createMemo(() => Object.values(sync.data.mcp).filter((x) => x.status === "connected").length)
  const mcpError = createMemo(() => Object.values(sync.data.mcp).some((x) => x.status === "failed"))
  const permissions = createMemo(() => {
    if (route.data.type !== "session") return []
    return sync.data.permission[route.data.sessionID] ?? []
  })
  const directory = useDirectory()
  const connected = useConnected()

  const [store, setStore] = createStore({
    welcome: false,
  })

  onMount(() => {
    // Track all timeouts to ensure proper cleanup
    const timeouts: ReturnType<typeof setTimeout>[] = []

    function tick() {
      if (connected()) return
      if (!store.welcome) {
        setStore("welcome", true)
        timeouts.push(setTimeout(() => tick(), 5000))
        return
      }

      if (store.welcome) {
        setStore("welcome", false)
        timeouts.push(setTimeout(() => tick(), 10_000))
        return
      }
    }
    timeouts.push(setTimeout(() => tick(), 10_000))

    onCleanup(() => {
      timeouts.forEach(clearTimeout)
    })
  })

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      width="100%"
      flexShrink={0}
      border={["top"]}
      borderColor={theme.borderSubtle}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Left: Directory & Branch */}
      <box flexDirection="row" gap={1} alignItems="center">
        <text fg={theme.textMuted}>{directory()}</text>
        <Show when={sync.data.vcs?.branch}>
          <text fg={theme.borderSubtle}>│</text>
          <text fg={theme.secondary}>⎇ {sync.data.vcs?.branch}</text>
        </Show>
        <Show when={autoApprove()}>
          <text fg={theme.borderSubtle}>│</text>
          <text fg={theme.error} attributes={TextAttributes.BOLD}>
            ⚡ AUTO-APPROVE
          </text>
        </Show>
      </box>

      {/* Center: Boxed Keycaps */}
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.text, bg: theme.backgroundElement }}> tab </span> agents
        </text>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.text, bg: theme.backgroundElement }}> ctrl+p </span> commands
        </text>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.text, bg: theme.backgroundElement }}> / </span> slash
        </text>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.text, bg: theme.backgroundElement }}> esc </span> to abort
        </text>
      </box>

      {/* Right: permissions */}
      <box flexDirection="row" alignItems="center" gap={1}>
        <Show when={permissions().length > 0}>
          <text fg={theme.warning}>
            {permissions().length} Permission{permissions().length > 1 ? "s" : ""}
          </text>
        </Show>
      </box>
    </box>
  )
}
