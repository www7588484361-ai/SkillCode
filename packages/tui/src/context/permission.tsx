import { useArgs } from "./args"
import { createSimpleContext } from "./helper"
import { useKV } from "./kv"

export type PermissionMode = "auto" | "normal"

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  init: () => {
    const args = useArgs()
    const kv = useKV()
    const [autoApprove, setAutoApprove] = kv.signal("auto_approve", args.auto ?? false)

    return {
      get mode(): PermissionMode {
        return autoApprove() ? "auto" : "normal"
      },
      set(mode: PermissionMode) {
        setAutoApprove(mode === "auto")
      },
      toggle() {
        setAutoApprove(!autoApprove())
      },
    }
  },
})

