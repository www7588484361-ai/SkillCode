import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

export interface AutoCheckpointOptions {
  cwd: string
  filePath: string
  action?: "edit" | "write" | "patch"
  model?: string
}

/**
 * Automatically creates an atomic git checkpoint commit whenever a file is modified.
 * If the workspace is inside a git repository, stages the modified file and commits
 * with an AI attribution trailer. Returns the commit hash if successful.
 */
export function autoGitCheckpoint(opts: AutoCheckpointOptions): string | undefined {
  try {
    const { cwd, filePath, action = "edit", model = "assistant" } = opts
    let gitRoot: string | undefined

    // 1. Check if .git exists directly in cwd
    if (fs.existsSync(path.join(cwd, ".git"))) {
      gitRoot = cwd
    } else {
      // 2. Discover git root using rev-parse --show-toplevel
      const probe = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      })
      if (probe.status === 0) {
        const root = probe.stdout.trim()
        if (root) gitRoot = path.resolve(root)
      }
    }

    if (!gitRoot) return undefined

    // Compute relative path to file from git root
    const relFile = path.relative(gitRoot, filePath)

    // Stage the touched file
    const addRes = spawnSync("git", ["add", "--", relFile], {
      cwd: gitRoot,
      stdio: "ignore",
      windowsHide: true,
    })
    if (addRes.status !== 0) return undefined

    // Check if there are staged changes to commit
    const diffProbe = spawnSync("git", ["diff", "--cached", "--quiet"], {
      cwd: gitRoot,
      stdio: "ignore",
      windowsHide: true,
    })
    if (diffProbe.status === 0) {
      // Zero exit code means index matches HEAD (nothing new staged)
      return undefined
    }

    const filename = path.basename(filePath)
    const commitMsg = `spacecode: ${action} ${filename}\n\nCo-authored-by: SpaceCode <${model}>`

    // Fallback user config if git author is not yet set
    const userCheck = spawnSync("git", ["config", "user.name"], {
      cwd: gitRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    })
    const extraArgs =
      userCheck.status !== 0 || !userCheck.stdout.trim()
        ? ["-c", "user.name=SpaceCode", "-c", "user.email=spacecode@assistant.local"]
        : []

    const commitRes = spawnSync("git", [...extraArgs, "commit", "--no-verify", "-m", commitMsg], {
      cwd: gitRoot,
      stdio: "ignore",
      windowsHide: true,
    })

    if (commitRes.status === 0) {
      const revRes = spawnSync("git", ["rev-parse", "HEAD"], {
        cwd: gitRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      })
      if (revRes.status === 0) {
        return revRes.stdout.trim()
      }
    }
  } catch {
    // Checkpointing is best-effort and must never interrupt editing
  }
  return undefined
}
