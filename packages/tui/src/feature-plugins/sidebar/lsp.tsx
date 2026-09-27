import type { TuiPlugin, TuiPluginApi } from "@spacecode/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"

const id = "internal:sidebar-lsp"

const tui: TuiPlugin = async () => {}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin

