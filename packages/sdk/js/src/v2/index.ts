export * from "./client.js"
export * from "./server.js"

import { createSpacecodeClient } from "./client.js"
import { createSpacecodeServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createSpacecode(options?: ServerOptions) {
  const server = await createSpacecodeServer({
    ...options,
  })

  const client = createSpacecodeClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
