import { run as runTui, type TuiInput } from "@spacecode/tui"
import { Global } from "@spacecode/core/global"
import { AppNodeBuilder } from "@spacecode/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
