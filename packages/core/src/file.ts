export * as File from "./file"

import { Revert } from "@spacecode/schema/revert"

export const Diff = Revert.FileDiff
export type Diff = typeof Diff.Type
