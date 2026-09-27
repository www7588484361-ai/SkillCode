// Shared active-session token accounting for the sidebar context widget and
// the prompt footer usage readout.
//
// The computation is deliberately bound to an explicit session ID and filters
// every message by `message.sessionID === sessionID`, so switching sessions
// or starting a fresh thread (`/new`, empty history) always resets the
// counter instead of leaking another conversation's totals. Usage is derived
// from the most recent completed assistant turn of THIS session only:
//   tokens = input + output + reasoning + cache.read + cache.write
//   percent = tokens / <that turn's model context limit>
//
// `input` on the last assistant message is the cumulative context size at
// that turn, which is exactly the "current context usage" number. During
// streaming the in-flight turn reports zero output until the first usage
// event lands, so the readout holds the previous turn's total and then ticks
// forward with every `message.updated` event — strictly within this session.

export interface UsageModel {
  readonly limit?: {
    readonly context?: number
  }
}

export interface UsageResult {
  readonly tokens: number
  readonly percent: number | null
}

// Minimal structural shape so both `Message[]` unions and `AssistantMessage[]`
// are accepted; every field is re-validated before use.
export interface UsageMessage {
  readonly role: string
  readonly sessionID?: string
  readonly providerID?: string
  readonly modelID?: string
  readonly tokens?: {
    readonly input: number
    readonly output: number
    readonly reasoning: number
    readonly cache: {
      readonly read: number
      readonly write: number
    }
  }
}

function messageTokens(tokens: NonNullable<UsageMessage["tokens"]>): number {
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

export function sessionUsage(
  sessionID: string,
  messages: readonly UsageMessage[],
  findModel: (providerID: string, modelID: string) => UsageModel | undefined,
): UsageResult {
  const empty: UsageResult = { tokens: 0, percent: null }
  if (!sessionID) return empty
  let last: UsageMessage | undefined
  for (const item of messages) {
    if (item.sessionID !== sessionID) continue
    if (item.role !== "assistant") continue
    if (!item.tokens || item.tokens.output <= 0) continue
    if (typeof item.providerID !== "string" || typeof item.modelID !== "string") continue
    last = item
  }
  if (!last?.tokens || typeof last.providerID !== "string" || typeof last.modelID !== "string") return empty
  const tokens = messageTokens(last.tokens)
  const model = findModel(last.providerID, last.modelID)
  const limit = model?.limit?.context
  return {
    tokens,
    percent: limit ? Math.round((tokens / limit) * 100) : null,
  }
}
