// @ts-nocheck

import { SpaceCode } from "@spacecode/core"
import { ReadTool } from "@spacecode/core/tools"

const spacecode = SpaceCode.make({})

spacecode.tool.add(ReadTool)

spacecode.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

spacecode.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

spacecode.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await spacecode.session.create({
  agent: "build",
})

spacecode.subscribe((event) => {
  console.log(event)
})

await spacecode.session.prompt({
  sessionID,
  text: "hey what is up",
})

await spacecode.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await spacecode.session.wait()

console.log(await spacecode.session.messages(sessionID))
