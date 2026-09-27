import { useRoute } from "../context/route"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { Show } from "solid-js"
import { TextAttributes } from "@opentui/core"

export function TopNav() {
  const route = useRoute()
  const { theme } = useTheme()
  const sync = useSync()

  const isHome = () => route.data.type === "home"
  const isSession = () => route.data.type === "session"

  return (
    <box
      width="100%"
      flexDirection="row"
      justifyContent="space-between"
      alignItems="flex-start"
      paddingLeft={1}
      paddingRight={1}
      height={2}
      flexShrink={0}
      backgroundColor={theme.background}
    >
      {/* Left: skillcode */}
      <box flexDirection="row" alignItems="center">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          skillcode
        </text>
      </box>

      {/* Center Tabs: boot | session */}
      <box flexDirection="row" gap={3} alignItems="flex-start">
        <box
          flexDirection="column"
          alignItems="center"
          onMouseUp={() => route.navigate({ type: "home" })}
        >
          <text
            fg={isHome() ? theme.text : theme.textMuted}
            attributes={isHome() ? TextAttributes.BOLD : undefined}
          >
            boot
          </text>
          <Show when={isHome()} fallback={<box height={1} />}>
            <text fg={theme.primary}>────</text>
          </Show>
        </box>

        <box
          flexDirection="column"
          alignItems="center"
          onMouseUp={() => {
            if (isSession()) return
            const sessions = sync.session.query()
            if (sessions.length > 0) {
              route.navigate({ type: "session", sessionID: sessions[0].id })
            }
          }}
        >
          <text
            fg={isSession() ? theme.text : theme.textMuted}
            attributes={isSession() ? TextAttributes.BOLD : undefined}
          >
            session
          </text>
          <Show when={isSession()} fallback={<box height={1} />}>
            <text fg={theme.primary}>───────</text>
          </Show>
        </box>
      </box>

      {/* Right spacer */}
      <box />
    </box>
  )
}
