export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@spacecode/schema/event"
import { EventManifest } from "@spacecode/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
