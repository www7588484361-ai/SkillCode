declare global {
  const SPACECODE_VERSION: string
  const SPACECODE_CHANNEL: string
  // Legacy compile-time globals injected by older builds; kept as fallback.
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
}

function pick(space: unknown, legacy: unknown): string | undefined {
  if (typeof space === "string") return space
  if (typeof legacy === "string") return legacy
  return undefined
}

export const InstallationVersion =
  pick(typeof SPACECODE_VERSION === "string" ? SPACECODE_VERSION : undefined, typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : undefined) ??
  "beta"
export const InstallationChannel =
  pick(typeof SPACECODE_CHANNEL === "string" ? SPACECODE_CHANNEL : undefined, typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : undefined) ??
  "beta"
export const InstallationLocal = InstallationChannel === "local"
