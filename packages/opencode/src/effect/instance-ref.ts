import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@spacecode/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~spacecode/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~spacecode/WorkspaceRef", {
  defaultValue: () => undefined,
})
