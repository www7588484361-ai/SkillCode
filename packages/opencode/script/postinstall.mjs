#!/usr/bin/env node

import childProcess from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { createRequire } from "module"
import { fileURLToPath } from "url"

try {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const rootDir = path.resolve(scriptDir, "..")
  const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json")
  const require = createRequire(import.meta.url)

  let packageJson = {}
  try {
    if (fs.existsSync(packageJsonPath)) {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
    }
  } catch (err) {
    console.warn("SkillCode postinstall: could not read package.json:", err.message)
  }

  const platformMap = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  }
  const archMap = {
    x64: "x64",
    arm64: "arm64",
    arm: "arm",
  }

  const platform = platformMap[os.platform()] ?? os.platform()
  const arch = archMap[os.arch()] ?? os.arch()
  const base = `skillcode-${platform}-${arch}`
  const legacyBase = `spacecode-${platform}-${arch}`
  const sourceBinary = platform === "windows" ? "skillcode.exe" : "skillcode"
  const legacySourceBinary = platform === "windows" ? "spacecode.exe" : "spacecode"
  const targetBinary = path.join(rootDir, "bin", platform === "windows" ? "skillcode.exe" : "skillcode")
  const legacyTargetBinary = path.join(rootDir, "bin", platform === "windows" ? "spacecode.exe" : "spacecode")

  function supportsAvx2() {
    if (arch !== "x64") return false

    if (platform === "linux") {
      try {
        return /(^|\s)avx2(\s|$)/i.test(fs.readFileSync("/proc/cpuinfo", "utf8"))
      } catch {
        return false
      }
    }

    if (platform === "darwin") {
      try {
        const result = childProcess.spawnSync("sysctl", ["-n", "hw.optional.avx2_0"], {
          encoding: "utf8",
          timeout: 1500,
        })
        if (result.status !== 0) return false
        return (result.stdout || "").trim() === "1"
      } catch {
        return false
      }
    }

    if (platform === "windows") {
      const command =
        '(Add-Type -MemberDefinition "[DllImport(""kernel32.dll"")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)'

      for (const executable of ["powershell.exe", "pwsh.exe", "pwsh", "powershell"]) {
        try {
          const result = childProcess.spawnSync(executable, ["-NoProfile", "-NonInteractive", "-Command", command], {
            encoding: "utf8",
            timeout: 3000,
            windowsHide: true,
          })
          if (result.status !== 0) continue
          const output = (result.stdout || "").trim().toLowerCase()
          if (output === "true" || output === "1") return true
          if (output === "false" || output === "0") return false
        } catch {
          continue
        }
      }
    }

    return false
  }

  function isMusl() {
    if (platform !== "linux") return false

    try {
      if (fs.existsSync("/etc/alpine-release")) return true
    } catch {
      // Ignore filesystem probes that are blocked by the host.
    }

    try {
      const result = childProcess.spawnSync("ldd", ["--version"], { encoding: "utf8" })
      return `${result.stdout || ""}${result.stderr || ""}`.toLowerCase().includes("musl")
    } catch {
      return false
    }
  }

  function packageNames() {
    const baseline = arch === "x64" && !supportsAvx2()
    const list = []

    if (platform === "linux") {
      if (isMusl()) {
        if (arch === "x64")
          list.push(...(baseline
            ? [`${base}-baseline-musl`, `${base}-musl`, `${base}-baseline`, base]
            : [`${base}-musl`, `${base}-baseline-musl`, base, `${base}-baseline`]))
        else list.push(`${base}-musl`, base)
      } else {
        if (arch === "x64")
          list.push(...(baseline
            ? [`${base}-baseline`, base, `${base}-baseline-musl`, `${base}-musl`]
            : [base, `${base}-baseline`, `${base}-musl`, `${base}-baseline-musl`]))
        else list.push(base, `${base}-musl`)
      }
    } else if (arch === "x64") {
      list.push(...(baseline ? [`${base}-baseline`, base] : [base, `${base}-baseline`]))
    } else {
      list.push(base)
    }

    // Also include scoped and legacy spacecode packages as fallbacks
    const scopedList = list.map((pkg) => pkg.replace("skillcode-", "@nexor009/skillcode-"))
    const legacyList = list.map((pkg) => pkg.replace("skillcode-", "spacecode-"))
    return [...scopedList, ...list, ...legacyList]
  }

  function resolveBinary(name) {
    const pJsonPath = require.resolve(`${name}/package.json`)
    for (const bin of [sourceBinary, legacySourceBinary]) {
      const binaryPath = path.join(path.dirname(pJsonPath), "bin", bin)
      if (fs.existsSync(binaryPath)) return binaryPath
    }
    throw new Error(`Binary not found in ${name}`)
  }

  function installPackage(name) {
    const version = packageJson.optionalDependencies?.[name]
    if (!version) return

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "skillcode-install-"))
    try {
      const isWindows = process.platform === "win32"
      const npmExe = isWindows ? "npm.cmd" : "npm"
      const result = childProcess.spawnSync(
        npmExe,
        ["install", "--ignore-scripts", "--no-save", "--loglevel=error", "--prefix", temp, `${name}@${version}`],
        { stdio: "inherit", windowsHide: true, shell: isWindows },
      )
      if (result.status !== 0) return
      const packageDir = path.join(temp, "node_modules", name)
      for (const bin of [sourceBinary, legacySourceBinary]) {
        const src = path.join(packageDir, "bin", bin)
        if (fs.existsSync(src)) {
          copyBinary(src, targetBinary)
          return true
        }
      }
      return false
    } finally {
      fs.rmSync(temp, { recursive: true, force: true })
    }
  }

  function copyBinary(source, target) {
    if (!fs.existsSync(source)) throw new Error(`Binary not found at ${source}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (fs.existsSync(target)) fs.unlinkSync(target)
    try {
      fs.linkSync(source, target)
    } catch {
      fs.copyFileSync(source, target)
    }
    fs.chmodSync(target, 0o755)

    if (legacyTargetBinary && legacyTargetBinary !== target) {
      if (fs.existsSync(legacyTargetBinary)) fs.unlinkSync(legacyTargetBinary)
      try {
        fs.linkSync(target, legacyTargetBinary)
      } catch {
        fs.copyFileSync(target, legacyTargetBinary)
      }
      fs.chmodSync(legacyTargetBinary, 0o755)
    }
  }

  function verifyBinary() {
    const result = childProcess.spawnSync(targetBinary, ["--version"], {
      encoding: "utf8",
      stdio: "ignore",
      windowsHide: true,
    })
    return result.status === 0
  }

  function main() {
    if (fs.existsSync(targetBinary) && verifyBinary()) return

    for (const name of packageNames()) {
      try {
        copyBinary(resolveBinary(name), targetBinary)
        if (verifyBinary()) return
      } catch {
        if (installPackage(name) && verifyBinary()) return
      }
    }

    // Also check local dist paths for monorepo development
    const distCandidates = [
      path.join(rootDir, "dist", "@nexor009", base, "bin", sourceBinary),
      path.join(rootDir, "dist", base, "bin", sourceBinary),
      path.join(rootDir, "dist", legacyBase, "bin", legacySourceBinary),
    ]
    for (const candidate of distCandidates) {
      if (fs.existsSync(candidate)) {
        copyBinary(candidate, targetBinary)
        if (verifyBinary()) return
      }
    }

    console.warn(
      `SkillCode postinstall note: Prebuilt binary for ${platform}-${arch} could not be placed immediately. It will be downloaded or resolved dynamically at first run.`
    )
  }

  main()
} catch (error) {
  console.warn("SkillCode postinstall warning:", error.message)
  process.exit(0)
}
