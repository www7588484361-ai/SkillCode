import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

// SpaceCode rebrand: helpers accept SPACECODE_* names and transparently fall
// back to the legacy OPENCODE_* name, so existing env keeps working.
const legacy = (name: string) => name.replace(/^SPACECODE_/, "OPENCODE_")
const bool = (name: string) =>
  Config.boolean(name).pipe(
    Config.orElse(() => Config.boolean(legacy(name))),
    Config.withDefault(false),
  )
const positiveInteger = (name: string) => {
  const read = (key: string) =>
    Config.number(key).pipe(
      Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
      Config.orElse(() => Config.succeed(undefined)),
    )
  return read(name).pipe(Config.orElse(() => read(legacy(name))))
}
const experimental = bool("SPACECODE_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({
    experimental,
    enabled: Config.boolean(name).pipe(
      Config.orElse(() => Config.boolean(legacy(name))),
      Config.option,
    ),
  }).pipe(Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)))

export class Service extends ConfigService.Service<Service>()("@spacecode/RuntimeFlags", {
  autoShare: bool("SPACECODE_AUTO_SHARE"),
  pure: bool("SPACECODE_PURE"),
  disableDefaultPlugins: bool("SPACECODE_DISABLE_DEFAULT_PLUGINS"),
  disableEmbeddedWebUi: bool("SPACECODE_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("SPACECODE_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("SPACECODE_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("SPACECODE_DISABLE_CLAUDE_CODE"),
    direct: bool("SPACECODE_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("SPACECODE_DISABLE_CLAUDE_CODE"),
    direct: bool("SPACECODE_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("SPACECODE_ENABLE_EXA"),
    legacy: bool("SPACECODE_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("SPACECODE_ENABLE_PARALLEL"),
    legacy: bool("SPACECODE_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("SPACECODE_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("SPACECODE_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("SPACECODE_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: enabledByExperimental("SPACECODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("SPACECODE_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("SPACECODE_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("SPACECODE_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("SPACECODE_EXPERIMENTAL_PLAN_MODE"),
  experimentalCodeMode: enabledByExperimental("SPACECODE_EXPERIMENTAL_CODE_MODE"),
  experimentalEventSystem: enabledByExperimental("SPACECODE_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("SPACECODE_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("SPACECODE_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("SPACECODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("SPACECODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("SPACECODE_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("SPACECODE_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("SPACECODE_CLIENT").pipe(
    Config.orElse(() => Config.string("OPENCODE_CLIENT")),
    Config.withDefault("cli"),
  ),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const node = LayerNode.make({ service: Service, layer: Service.layer.pipe(Layer.orDie), deps: [] })

export * as RuntimeFlags from "./runtime-flags"
import { LayerNode } from "@spacecode/core/effect/layer-node"
