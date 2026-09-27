import { AgentV2 } from "@spacecode/core/agent"
import { AISDK } from "@spacecode/core/aisdk"
import { Catalog } from "@spacecode/core/catalog"
import { CommandV2 } from "@spacecode/core/command"
import { Credential } from "@spacecode/core/credential"
import { AppNodeBuilder } from "@spacecode/core/effect/app-node-builder"
import { LayerNodePlatform } from "@spacecode/core/effect/app-node-platform"
import { LayerNode } from "@spacecode/core/effect/layer-node"
import { EventV2 } from "@spacecode/core/event"
import { FileSystem } from "@spacecode/core/filesystem"
import { FSUtil } from "@spacecode/core/fs-util"
import { Integration } from "@spacecode/core/integration"
import { Location } from "@spacecode/core/location"
import { Npm } from "@spacecode/core/npm"
import { PluginV2 } from "@spacecode/core/plugin"
import { Reference } from "@spacecode/core/reference"
import { SkillV2 } from "@spacecode/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
