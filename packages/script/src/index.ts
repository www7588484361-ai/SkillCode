import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  SPACECODE_CHANNEL: (process.env["SKILLCODE_CHANNEL"] ?? process.env["SPACECODE_CHANNEL"] ?? process.env["OPENCODE_CHANNEL"]),
  SPACECODE_BUMP: (process.env["SKILLCODE_BUMP"] ?? process.env["SPACECODE_BUMP"] ?? process.env["OPENCODE_BUMP"]),
  SPACECODE_VERSION: (process.env["SKILLCODE_VERSION"] ?? process.env["SPACECODE_VERSION"] ?? process.env["OPENCODE_VERSION"]),
  SPACECODE_RELEASE: (process.env["SKILLCODE_RELEASE"] ?? process.env["SPACECODE_RELEASE"] ?? process.env["OPENCODE_RELEASE"]),
}
const CHANNEL = env.SPACECODE_CHANNEL || "beta"
const IS_PREVIEW = false

const VERSION = env.SPACECODE_VERSION || "1.0.0-beta.6"

const bot = ["actions-user", "opencode", "opencode-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const team = [
  ...(await Bun.file(teamPath)
    .text()
    .then((x) => x.split(/\r?\n/).map((x) => x.trim()))
    .then((x) => x.filter((x) => x && !x.startsWith("#")))),
  ...bot,
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.SPACECODE_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`spacecode script`, JSON.stringify(Script, null, 2))
