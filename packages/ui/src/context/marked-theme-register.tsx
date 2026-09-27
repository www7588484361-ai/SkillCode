import { registerCustomTheme } from "@pierre/diffs"
import { SpaceCodeTheme } from "./marked-theme"

let registered = false

export function registerSpaceCodeTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("SpaceCode", () => Promise.resolve(SpaceCodeTheme))
}
