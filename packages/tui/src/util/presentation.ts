import { logo } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

function wordmark(pad = "") {
  const rowColors = [
    "\x1b[1;37m",
    "\x1b[38;5;253m\x1b[1m",
    "\x1b[38;5;247m\x1b[1m",
    "\x1b[38;5;241m\x1b[1m",
    "\x1b[1;37m",
  ]
  const shadow = "\x1b[38;5;245m"
  const draw = (line: string, fg: string) =>
    [...line]
      .map((char) => {
        if ("╔╗╚╝║═╦╩╠╣┌┐└┘│─".includes(char)) return `${shadow}${char}${reset}`
        if (char === "░" || char === "▒") return `${shadow}${char}${reset}`
        if (char === "▓") return `${fg}${char}${reset}`
        if (char === "_") return `${shadow} ${reset}`
        if (char === "^") return `${fg}${shadow}▀${reset}`
        if (char === "~") return `${shadow}▀${reset}`
        if (char === ",") return `${shadow}▄${reset}`
        if (char === " ") return " "
        return `${fg}${char}${reset}`
      })
      .join("")

  return logo.left.map((line, index) => {
    const fg = rowColors[index] ?? rowColors[0]
    const left = draw(line, fg)
    const right = draw(logo.right[index] ?? "", fg)
    return `${pad}${left} ${right}`
  })
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}skillcode -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
