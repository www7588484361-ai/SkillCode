import { createMemo } from "solid-js"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"

function getThinkingDescriptions(modelID: string, providerID: string, npm?: string) {
  const id = modelID.toLowerCase()
  const prov = providerID.toLowerCase()
  const pkg = npm?.toLowerCase() ?? ""

  if (id.includes("r1") || id.includes("deepseek")) {
    return {
      off: "Direct reply / 0 reasoning tokens (non-thinking mode)",
      low: "Low reasoning effort (fast chain-of-thought)",
      medium: "Standard reasoning effort (balanced chain-of-thought)",
      high: "Deep thinking (full DeepSeek R1 reasoning chain)",
    }
  }

  if (id.includes("claude-3-7") || id.includes("claude-3.7")) {
    return {
      off: "Thinking disabled (standard Claude response)",
      low: "Low thinking budget (2,048 tokens)",
      medium: "Balanced thinking budget (4,096 tokens)",
      high: "Extended thinking budget (16,384 tokens)",
    }
  }

  if (id.includes("gemini") || prov.includes("google") || pkg.includes("google")) {
    return {
      off: "Thinking disabled (thinkingBudget: 0)",
      low: "Fast reasoning budget (2,048 tokens)",
      medium: "Standard reasoning budget (4,096 tokens)",
      high: "Deep reasoning budget (16,384 tokens)",
    }
  }

  if (id.includes("o1") || id.includes("o3") || id.includes("gpt-5")) {
    return {
      off: "Minimal / standard mode",
      low: "Low reasoning effort",
      medium: "Medium reasoning effort",
      high: "High reasoning effort (maximum depth)",
    }
  }

  return {
    off: "0 reasoning tokens / direct reply",
    low: "Low (1k-2k tokens / quick scratchpad)",
    medium: "Medium (4k tokens / balanced reasoning)",
    high: "High (8k-16k+ tokens / deep thinking)",
  }
}

export function DialogVariant(props?: {
  target?: { providerID: string; modelID: string }
}) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()

  const target = createMemo(() => props?.target ?? local.model.current())
  const provider = createMemo(() => sync.data.provider.find((item) => item.id === target()?.providerID))
  const info = createMemo(() => {
    const t = target()
    if (!t) return undefined
    return provider()?.models[t.modelID]
  })
  const modelName = createMemo(() => info()?.name ?? target()?.modelID ?? "Model")

  const descriptions = createMemo(() =>
    getThinkingDescriptions(
      target()?.modelID ?? "",
      target()?.providerID ?? "",
      info()?.api?.npm,
    ),
  )

  const currentSelection = createMemo(() => {
    const t = target()
    if (!t) return undefined
    const selected = local.model.variant.selected(t)
    return selected ?? "medium"
  })

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const desc = descriptions()
    const t = target()
    if (!t) return []

    const select = (value: string | undefined) => {
      dialog.clear()
      local.model.setWithVariant(t, value, { recent: true })
    }

    const standard: DialogSelectOption<string>[] = [
      {
        value: "off",
        title: "Off",
        description: desc.off,
        onSelect: () => select("off"),
      },
      {
        value: "low",
        title: "Low",
        description: desc.low,
        onSelect: () => select("low"),
      },
      {
        value: "medium",
        title: "Medium",
        description: desc.medium,
        onSelect: () => select("medium"),
      },
      {
        value: "high",
        title: "High",
        description: desc.high,
        onSelect: () => select("high"),
      },
    ]

    const definedVariants = Object.keys(info()?.variants ?? {})
    const custom: DialogSelectOption<string>[] = definedVariants
      .filter((v) => !["off", "low", "medium", "high", "none", "default"].includes(v.toLowerCase()))
      .map((v) => ({
        value: v,
        title: v,
        description: "Model-defined variant",
        onSelect: () => select(v),
      }))

    const fallback: DialogSelectOption<string> = {
      value: "default",
      title: "Default",
      description: "Provider recommended default",
      onSelect: () => select(undefined),
    }

    return [...standard, ...custom, fallback]
  })

  return (
    <DialogSelect<string>
      options={options()}
      title={`Select Thinking Level: ${modelName()}`}
      current={currentSelection()}
      flat={true}
    />
  )
}
