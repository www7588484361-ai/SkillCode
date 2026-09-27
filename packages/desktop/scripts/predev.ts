import { $ } from "bun"
import { downloadCliToResources } from "./utils"

await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${(process.env.SPACECODE_CHANNEL ?? process.env.OPENCODE_CHANNEL) ?? "dev"}`

await $`cd ../spacecode && bun script/build-node.ts`
await downloadCliToResources()
