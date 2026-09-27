import { Layer } from "effect"
import { Flag } from "../flag/flag"
import { InstallationChannel, InstallationVersion } from "../installation/version"
import { runID } from "./shared"

// SpaceCode local-first: remote observability export is hard-disabled.
// This module previously transmitted traces/logs to a configurable OTLP
// endpoint (OTEL_EXPORTER_OTLP_ENDPOINT). All dispatchers below are now
// clean no-ops so downstream code never throws missing-export errors and
// no usage or debug data ever leaves the machine.
const endpoint: string | undefined = undefined

const headers: Record<string, string> | undefined = undefined

function resourceAttributes() {
  const value = process.env.OTEL_RESOURCE_ATTRIBUTES
  if (!value) return {}
  try {
    return Object.fromEntries(
      value.split(",").map((entry) => {
        const index = entry.indexOf("=")
        if (index < 1) throw new Error("Invalid OTEL_RESOURCE_ATTRIBUTES entry")
        return [decodeURIComponent(entry.slice(0, index)), decodeURIComponent(entry.slice(index + 1))]
      }),
    )
  } catch {
    return {}
  }
}

export function resource(): { serviceName: string; serviceVersion: string; attributes: Record<string, string> } {
  return {
    serviceName: "spacecode",
    serviceVersion: InstallationVersion,
    attributes: {
      ...resourceAttributes(),
      "deployment.environment.name": InstallationChannel,
      "spacecode.client": Flag.SPACECODE_CLIENT,
      "spacecode.run": runID,
      "service.instance.id": runID,
    },
  }
}

export function loggers() {
  // SpaceCode local-first: never export logs remotely.
  void endpoint
  void headers
  return []
}

export async function tracingLayer() {
  // SpaceCode local-first: never export traces remotely. The OTLP exporter
  // packages (@opentelemetry/exporter-trace-otlp-http, sdk-trace-base) were
  // removed from manifests; this stays a no-op layer.
  void endpoint
  return Layer.empty
}

export * as Otlp from "./otlp"
