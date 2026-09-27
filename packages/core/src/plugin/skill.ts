/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeSpacecodeContent from "./skill/customize-spacecode.md" with { type: "text" }

export const CustomizeSpacecodeContent = customizeSpacecodeContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-spacecode",
            description:
              "Use ONLY when the user is editing or creating spacecode's own configuration: spacecode.json, spacecode.jsonc, files under .spacecode/, or files under ~/.config/spacecode/. Also use when creating or fixing spacecode agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring spacecode itself.",
            location: AbsolutePath.make("/builtin/customize-spacecode.md"),
            content: CustomizeSpacecodeContent,
          }),
        }),
      )
    })
  }),
})
