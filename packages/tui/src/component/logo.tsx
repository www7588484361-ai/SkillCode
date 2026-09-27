import { RGBA, TextAttributes } from "@opentui/core"
import { createMemo, For, Show, type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"

export const BANNER_LINES = [
  " ██████╗ ██╗  ██╗ ██╗  ██╗      ██╗          ██████╗  ██████╗  ██████╗  ███████╗",
  "██╔════╝ ██║ ██╔╝ ██║  ██║      ██║         ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝",
  "╚█████╗  █████╔╝  ██║  ██║      ██║         ██║      ██║   ██║ ██║  ██║ █████╗  ",
  " ╚═══██╗ ██╔═██╗  ██║  ██║      ██║         ██║      ██║   ██║ ██║  ██║ ██╔══╝  ",
  "██████╔╝ ██║  ██╗ ██║  ███████╗ ███████╗    ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗",
  "╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚══════╝ ╚══════╝     ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝",
]

export const COMPACT_BANNER = [
  " ▄▀▀▀ █ ▄▀ ▄█▄ █    █       ▄▀▀▀ ▄▀▀▄ █▀▀▄ █▀▀▀",
  " ▀▀▀▄ █▀▄   █  █    █       █    █  █ █  █ █▄▄ ",
  " ▀▄▄▀ █  █ ▄█▄ █▄▄▄ █▄▄▄    ▀▄▄▄ ▀▄▄▀ █▄▄▀ █▄▄▄",
]

export const BANNER_WIDTH = Math.max(...BANNER_LINES.map((row) => row.length))

const ROW_COLORS = [
  RGBA.fromHex("#FFFFFF"),
  RGBA.fromHex("#F5F5F5"),
  RGBA.fromHex("#E4E4E6"),
  RGBA.fromHex("#E5E4E6"),
  RGBA.fromHex("#D5D5D6"),
  RGBA.fromHex("#FFFFFF"),
]

export function Logo(): JSX.Element {
  const dimensions = useTerminalDimensions()
  const isCompact = createMemo(() => dimensions().width < BANNER_WIDTH + 4)

  return (
    <box flexDirection="column" alignItems="center" justifyContent="center">
      <Show
        when={!isCompact()}
        fallback={
          <box flexDirection="column" alignItems="center">
            <For each={COMPACT_BANNER}>
              {(row, i) => (
                <text fg={ROW_COLORS[Math.min(i(), ROW_COLORS.length - 1)]} attributes={TextAttributes.BOLD}>
                  {row}
                </text>
              )}
            </For>
          </box>
        }
      >
        <box flexDirection="column" alignItems="center">
          <For each={BANNER_LINES}>
            {(row, i) => (
              <text fg={ROW_COLORS[i()]} attributes={TextAttributes.BOLD}>
                {row}
              </text>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}
