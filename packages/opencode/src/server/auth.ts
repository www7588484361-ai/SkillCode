export * as ServerAuth from "./auth"

import { ConfigService } from "@/effect/config-service"
import { Flag } from "@spacecode/core/flag/flag"
import { Config as EffectConfig, Context, Option, Redacted } from "effect"

export type Credentials = {
  password?: string
  username?: string
}

export type DecodedCredentials = {
  readonly username: string
  readonly password: Redacted.Redacted
}

export class Config extends ConfigService.Service<Config>()("@spacecode/ServerAuthConfig", {
  // SkillCode rebrand: SKILLCODE_* preferred, legacy SPACECODE_* / OPENCODE_* honored.
  password: EffectConfig.string("SKILLCODE_SERVER_PASSWORD").pipe(
    EffectConfig.orElse(() => EffectConfig.string("SPACECODE_SERVER_PASSWORD")),
    EffectConfig.orElse(() => EffectConfig.string("OPENCODE_SERVER_PASSWORD")),
    EffectConfig.option,
  ),
  username: EffectConfig.string("SKILLCODE_SERVER_USERNAME").pipe(
    EffectConfig.orElse(() => EffectConfig.string("SPACECODE_SERVER_USERNAME")),
    EffectConfig.orElse(() => EffectConfig.string("OPENCODE_SERVER_USERNAME")),
    EffectConfig.withDefault("skillcode"),
  ),
}) {}

export type Info = Context.Service.Shape<typeof Config>

export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  return (
    Option.isSome(config.password) &&
    credentials.username === config.username &&
    Redacted.value(credentials.password) === config.password.value
  )
}

export function header(credentials?: Credentials) {
  const password = credentials?.password ?? process.env.SKILLCODE_SERVER_PASSWORD ?? Flag.SPACECODE_SERVER_PASSWORD
  if (!password) return undefined

  const username = credentials?.username ?? process.env.SKILLCODE_SERVER_USERNAME ?? Flag.SPACECODE_SERVER_USERNAME ?? "skillcode"
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

export function headers(credentials?: Credentials) {
  const authorization = header(credentials)
  if (!authorization) return undefined
  return { Authorization: authorization }
}
