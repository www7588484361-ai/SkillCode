import { EOL } from "os"
import { Schema } from "effect"

import { logo as glyphs } from "./logo"

export const BANNER_LINES = [
  " █████╗ ██░░██╗  █████╗ ██║     ██║     ██████╗  █████╗ ██████╗ ██████╗",
  "██░░╔═╝ ██░██╔╝  ╚═██╔╝ ██║     ██║     ██░░╔═╝ ██░░██║ ██░░██║ ██░░╔═╝",
  " █████╗ ████╔╝     ██║  ██║     ██║     ██░░║   ██░░██║ ██░░██║ █████╗ ",
  " ╔═╝██║ ██░╚██╗    ██║  ██░░╔═╗ ██░░╔═╗ ██░░╚═╗ ██░░██║ ██░░██║ ██░░╚═╗",
  "█████╝  ██░░██║  █████╗ ██████╝ ██████╝ ██████╝  █████╝ ██████╝ ██████╝",
]

export const BANNER_WIDTH = Math.max(...BANNER_LINES.map((row) => row.length))

const wordmark = BANNER_LINES

export class CancelledError extends Schema.TaggedErrorClass<CancelledError>()("UICancelledError", {}) {}

export const Style = {
  TEXT_HIGHLIGHT: "\x1b[96m",
  TEXT_HIGHLIGHT_BOLD: "\x1b[96m\x1b[1m",
  TEXT_DIM: "\x1b[90m",
  TEXT_DIM_BOLD: "\x1b[90m\x1b[1m",
  TEXT_NORMAL: "\x1b[0m",
  TEXT_NORMAL_BOLD: "\x1b[1m",
  TEXT_WARNING: "\x1b[93m",
  TEXT_WARNING_BOLD: "\x1b[93m\x1b[1m",
  TEXT_DANGER: "\x1b[91m",
  TEXT_DANGER_BOLD: "\x1b[91m\x1b[1m",
  TEXT_SUCCESS: "\x1b[92m",
  TEXT_SUCCESS_BOLD: "\x1b[92m\x1b[1m",
  TEXT_INFO: "\x1b[94m",
  TEXT_INFO_BOLD: "\x1b[94m\x1b[1m",
}

export function println(...message: string[]) {
  print(...message)
  process.stderr.write(EOL)
}

export function print(...message: string[]) {
  blank = false
  process.stderr.write(message.join(" "))
}

let blank = false
export function empty() {
  if (blank) return
  println("" + Style.TEXT_NORMAL)
  blank = true
}

function centerPad() {
  const columns = process.stdout.columns ?? 80
  return " ".repeat(Math.max(0, Math.floor((columns - BANNER_WIDTH) / 2)))
}

export function logo(pad?: string) {
  const prefix = pad ?? centerPad()
  if (!process.stdout.isTTY && !process.stderr.isTTY) {
    return wordmark.map((row) => `${prefix}${row}`).join(EOL)
  }

  const result: string[] = []
  const reset = "\x1b[0m"
  const rowColors = [
    "\x1b[1;37m",
    "\x1b[38;5;253m\x1b[1m",
    "\x1b[38;5;247m\x1b[1m",
    "\x1b[38;5;241m\x1b[1m",
    "\x1b[1;37m",
  ]
  const shadow = "\x1b[38;5;245m"
  const gap = " "
  const draw = (line: string, fg: string) => {
    const parts: string[] = []
    for (const char of line) {
      if ("╔╗╚╝║═╦╩╠╣┌┐└┘│─".includes(char)) {
        parts.push(shadow, char, reset)
        continue
      }
      if (char === "░" || char === "▒") {
        parts.push(shadow, char, reset)
        continue
      }
      if (char === "▓") {
        parts.push(fg, char, reset)
        continue
      }
      if (char === "_") {
        parts.push(shadow, " ", reset)
        continue
      }
      if (char === "^") {
        parts.push(fg, shadow, "▀", reset)
        continue
      }
      if (char === "~") {
        parts.push(shadow, "▀", reset)
        continue
      }
      if (char === ",") {
        parts.push(shadow, "▄", reset)
        continue
      }
      if (char === " ") {
        parts.push(" ")
        continue
      }
      parts.push(fg, char, reset)
    }
    return parts.join("")
  }
  glyphs.left.forEach((row, index) => {
    const fg = rowColors[index] ?? rowColors[0]
    if (prefix) result.push(prefix)
    result.push(draw(row, fg))
    result.push(gap)
    const other = glyphs.right[index] ?? ""
    result.push(draw(other, fg))
    result.push(EOL)
  })
  return result.join("").trimEnd()
}

export async function input(prompt: string): Promise<string> {
  const readline = require("readline")
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(prompt, (answer: string) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export function error(message: string) {
  if (message.startsWith("Error: ")) {
    message = message.slice("Error: ".length)
  }
  println(Style.TEXT_DANGER_BOLD + "Error: " + Style.TEXT_NORMAL + message)
}

export function markdown(text: string): string {
  return text
}

export * as UI from "./ui"
