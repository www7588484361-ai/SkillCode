// Boot-stage profiler for diagnosing slow startup.
//
// Enable with: SPACECODE_BOOT_PROFILE=1 spacecode [args]
// Prints high-resolution timestamps per boot stage to stderr. Zero overhead
// when disabled (single env check per mark).
//
// NOTE: marks can only observe time spent *inside* our code. Cold-start cost
// dominated by runtime module loading/transpilation (thousands of files on a
// cold disk cache) happens before the entrypoint executes — that cost is
// eliminated by shipping the single-file production bundle (see script/build.ts),
// not by anything measurable here.

const enabled = process.env.SPACECODE_BOOT_PROFILE === "1" || process.env.SPACECODE_BOOT_PROFILE === "true"
const start = performance.now()
let last = start

export function bootProfileEnabled() {
  return enabled
}

export function bootMark(stage: string) {
  if (!enabled) return
  const now = performance.now()
  process.stderr.write(`[boot +${(now - start).toFixed(0)}ms Δ${(now - last).toFixed(0)}ms] ${stage}\n`)
  last = now
}
