import type { TuiPlugin, TuiPluginApi } from "@spacecode/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo } from "solid-js"
import { RGBA } from "@opentui/core"
import { sessionUsage } from "../../util/session-usage"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

import { Show } from "solid-js"
import { TextAttributes } from "@opentui/core"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)

  const state = createMemo(() =>
    sessionUsage(props.session_id, msg(), (providerID, modelID) =>
      props.api.state.provider.find((item) => item.id === providerID)?.models[modelID],
    ),
  )

  return (
    <box>
      <text fg={theme().textMuted}>CONTEXT</text>
      <text fg={theme().text} attributes={TextAttributes.BOLD}>
        {state().percent !== null ? (state().percent === 0 ? "0.1%" : `${state().percent}%`) : "0%"}
      </text>
      {/* Progress meter bar */}
      <box flexDirection="row" width="100%" height={1}>
        {(() => {
          const totalWidth = 32
          const pct = Math.max(0, Math.min(100, state().percent ?? 0))
          const filled = Math.max(1, Math.round((pct / 100) * totalWidth))
          const empty = Math.max(0, totalWidth - filled)
          const barFg = pct > 80 ? theme().error : pct > 50 ? theme().warning : theme().primary
          return (
            <text>
              <Show when={filled > 0}>
                <span style={{ fg: barFg }}>{"─".repeat(filled)}</span>
              </Show>
              <span style={{ fg: theme().borderSubtle }}>{"─".repeat(empty)}</span>
            </text>
          )
        })()}
      </box>
      <text>
        <span style={{ fg: theme().textMuted }}>{state().tokens} tokens · </span>
        <span style={{ fg: theme().success }}>{money.format(cost())}</span>
        <span style={{ fg: theme().textMuted }}> spent</span>
      </text>
      <box height={1} marginTop={1}>
        <text fg={theme().borderSubtle}>{"─".repeat(32)}</text>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
