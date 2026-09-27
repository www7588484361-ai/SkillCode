import path from "node:path"
import fs from "node:fs"
import { spawn, type ChildProcess } from "node:child_process"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { EffectBridge } from "@/effect/bridge"

const MAX_BUFFER_BYTES = 500 * 1024 // 500 KB tail cap

class TailBuffer {
  private chunks: Buffer[] = []
  private totalBytes = 0

  constructor(private readonly maxBytes: number) {}

  append(chunk: Buffer) {
    this.chunks.push(chunk)
    this.totalBytes += chunk.byteLength
    while (this.totalBytes > this.maxBytes && this.chunks.length > 1) {
      const first = this.chunks[0]
      if (this.totalBytes - first.byteLength >= this.maxBytes) {
        this.chunks.shift()
        this.totalBytes -= first.byteLength
      } else {
        const toDrop = this.totalBytes - this.maxBytes
        this.chunks[0] = first.subarray(toDrop)
        this.totalBytes -= toDrop
        break
      }
    }
  }

  toString(): string {
    if (this.chunks.length === 0) return ""
    const buf = Buffer.concat(this.chunks)
    if (buf.byteLength > this.maxBytes) {
      return buf.subarray(buf.byteLength - this.maxBytes).toString("utf-8")
    }
    return buf.toString("utf-8")
  }
}

export const Parameters = Schema.Struct({
  command: Schema.String.annotate({
    description: "The shell command or script block to execute.",
  }),
  shell: Schema.optional(Schema.Literals(["powershell", "cmd"])).annotate({
    description: "The shell environment to execute the command with ('powershell' or 'cmd'). Defaults to 'powershell'.",
  }),
  cwd: Schema.optional(Schema.String).annotate({
    description: "The working directory for command execution. Defaults to current working directory.",
  }),
  timeout: Schema.optional(Schema.Number).annotate({
    description: "Command timeout in milliseconds. Defaults to 60000 ms.",
  }),
})

export interface OsExecuteResult {
  exitCode: number | null
  stdout: string
  stderr: string
  executionTimeMs: number
}

function killTree(proc: ChildProcess) {
  if (!proc.pid || proc.killed) return
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", proc.pid.toString()], {
        windowsHide: true,
        stdio: "ignore",
      })
    } catch {
      proc.kill()
    }
  } else {
    try {
      proc.kill("SIGKILL")
    } catch {
      // ignore
    }
  }
}

export const OsExecuteTool = Tool.define(
  "os_execute",
  Effect.gen(function* () {
    const bridge = yield* EffectBridge.make()

    return {
      description:
        "Executes arbitrary shell commands directly on the host Windows operating system. Supports PowerShell and CMD with unrestricted system access.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const cmdStr = params.command.trim()
          if (
            /python.*import\s+antigravity/i.test(cmdStr) ||
            /python.*-c\s+["'].*antigravity/i.test(cmdStr) ||
            /(?:python|py)\s+.*antigravity/i.test(cmdStr)
          ) {
            return {
              title: "Command Rejected: Invalid Antigravity Launch",
              metadata: { command: params.command, rejected: true },
              output:
                "Error: 'antigravity' is a desktop application on Windows, not a Python package. Do not use os_execute with python. Use 'cmd.exe /c start antigravity' to launch applications.",
            }
          }

          const shellType = params.shell ?? "powershell"
          const timeoutMs = typeof params.timeout === "number" && params.timeout > 0 ? params.timeout : 60_000

          let resolvedCwd = process.cwd()
          if (params.cwd) {
            const candidate = path.isAbsolute(params.cwd) ? params.cwd : path.resolve(process.cwd(), params.cwd)
            if (fs.existsSync(candidate)) {
              resolvedCwd = candidate
            }
          }

          yield* ctx.ask({
            permission: "os_execute",
            patterns: [params.command],
            always: ["*"],
            metadata: {
              command: params.command,
              shell: shellType,
              cwd: resolvedCwd,
            },
          })

          let bin: string
          let args: string[]

          if (shellType === "cmd") {
            bin = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "sh"
            args = process.platform === "win32" ? ["/c", params.command] : ["-c", params.command]
          } else {
            // powershell
            if (process.platform === "win32") {
              bin = "powershell.exe"
              args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", params.command]
            } else {
              bin = "pwsh"
              args = ["-NoProfile", "-NonInteractive", "-Command", params.command]
            }
          }

          return yield* Effect.promise(async () => {
            const startTime = Date.now()
            const stdoutBuf = new TailBuffer(MAX_BUFFER_BYTES)
            const stderrBuf = new TailBuffer(MAX_BUFFER_BYTES)

            let lastPreviewUpdate = 0
            const updatePreview = (text: string) => {
              const now = Date.now()
              if (now - lastPreviewUpdate > 100) {
                lastPreviewUpdate = now
                bridge.fork(
                  ctx.metadata({
                    metadata: {
                      output: text.slice(-4000),
                    },
                  }),
                )
              }
            }

            return new Promise<Tool.ExecuteResult<OsExecuteResult>>((resolve) => {
              let settled = false
              let timer: NodeJS.Timeout | undefined

              const proc = spawn(bin, args, {
                cwd: resolvedCwd,
                env: { ...process.env },
                windowsHide: true,
                shell: false,
              })

              const finish = (exitCode: number | null, extraStderr?: string) => {
                if (settled) return
                settled = true
                if (timer) clearTimeout(timer)
                ctx.abort.removeEventListener("abort", onAbort)

                if (extraStderr) {
                  stderrBuf.append(Buffer.from(extraStderr, "utf-8"))
                }

                const stdoutStr = stdoutBuf.toString()
                const stderrStr = stderrBuf.toString()
                const executionTimeMs = Date.now() - startTime

                const result: OsExecuteResult = {
                  exitCode,
                  stdout: stdoutStr,
                  stderr: stderrStr,
                  executionTimeMs,
                }

                resolve({
                  title: params.command,
                  metadata: result,
                  output: JSON.stringify(result, null, 2),
                })
              }

              const onAbort = () => {
                killTree(proc)
                finish(null, "\n[os_execute] Process aborted by user.")
              }

              ctx.abort.addEventListener("abort", onAbort, { once: true })

              if (ctx.abort.aborted) {
                onAbort()
                return
              }

              timer = setTimeout(() => {
                killTree(proc)
                finish(null, `\n[os_execute] Process timed out after ${timeoutMs}ms.`)
              }, timeoutMs)

              proc.stdout?.on("data", (chunk: Buffer) => {
                stdoutBuf.append(chunk)
                updatePreview(stdoutBuf.toString())
              })

              proc.stderr?.on("data", (chunk: Buffer) => {
                stderrBuf.append(chunk)
                updatePreview(stderrBuf.toString())
              })

              proc.on("error", (err) => {
                killTree(proc)
                finish(null, `\n[os_execute] Failed to start process: ${err.message}`)
              })

              proc.on("close", (code) => {
                finish(code)
              })
            })
          })
        }),
    }
  }),
)
