import type { TuiPlugin } from "@spacecode/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"

const id = "internal:home-tips"

const tui: TuiPlugin = async () => {}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
