import { afterEach, describe, expect, test } from "bun:test"
import { Option, Redacted } from "effect"
import { Flag } from "@spacecode/core/flag/flag"
import { ServerAuth } from "../../src/server/auth"

const original = {
  SPACECODE_SERVER_PASSWORD: Flag.SPACECODE_SERVER_PASSWORD,
  SPACECODE_SERVER_USERNAME: Flag.SPACECODE_SERVER_USERNAME,
}

afterEach(() => {
  Flag.SPACECODE_SERVER_PASSWORD = original.SPACECODE_SERVER_PASSWORD
  Flag.SPACECODE_SERVER_USERNAME = original.SPACECODE_SERVER_USERNAME
})

describe("ServerAuth", () => {
  test("does not emit auth headers without a password", () => {
    Flag.SPACECODE_SERVER_PASSWORD = undefined
    Flag.SPACECODE_SERVER_USERNAME = "alice"

    expect(ServerAuth.header()).toBeUndefined()
    expect(ServerAuth.headers()).toBeUndefined()
  })

  test("defaults to the spacecode username", () => {
    Flag.SPACECODE_SERVER_PASSWORD = "secret"
    Flag.SPACECODE_SERVER_USERNAME = undefined

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("spacecode:secret").toString("base64")}`,
    })
  })

  test("uses the configured username", () => {
    Flag.SPACECODE_SERVER_PASSWORD = "secret"
    Flag.SPACECODE_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    })
  })

  test("prefers explicit credentials", () => {
    Flag.SPACECODE_SERVER_PASSWORD = "secret"
    Flag.SPACECODE_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers({ password: "cli-secret", username: "bob" })).toEqual({
      Authorization: `Basic ${Buffer.from("bob:cli-secret").toString("base64")}`,
    })
  })

  test("validates decoded credentials against effect config", () => {
    const config = { password: Option.some("secret"), username: "alice" }

    expect(ServerAuth.required(config)).toBe(true)
    expect(ServerAuth.authorized({ username: "alice", password: Redacted.make("secret") }, config)).toBe(true)
    expect(ServerAuth.authorized({ username: "spacecode", password: Redacted.make("secret") }, config)).toBe(false)
  })
})
