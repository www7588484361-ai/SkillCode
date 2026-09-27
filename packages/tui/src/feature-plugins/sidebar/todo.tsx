import type { TuiPlugin, TuiPluginApi } from "@spacecode/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, For, Show } from "solid-js"
import { TodoItem } from "../../component/todo-item"

const id = "internal:sidebar-todo"

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const list = createMemo(() => (props.session_id ? props.api.state.session.todo(props.session_id) : []))
  const completed = createMemo(() => list().filter((x) => x.status === "completed").length)
  const total = createMemo(() => list().length)

  return (
    <box>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().textMuted}>TODOS</text>
        <Show when={total() > 0}>
          <text fg={theme().textMuted}>
            {completed()}/{total()}
          </text>
        </Show>
      </box>
      <Show
        when={total() > 0}
        fallback={<text fg={theme().textMuted}>No todos</text>}
      >
        <box gap={0}>
          <For each={list()}>{(item) => <TodoItem status={item.status} content={item.content} />}</For>
        </box>
      </Show>
      <box height={1} marginTop={1}>
        <text fg={theme().borderSubtle}>{"─".repeat(32)}</text>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 250,
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
