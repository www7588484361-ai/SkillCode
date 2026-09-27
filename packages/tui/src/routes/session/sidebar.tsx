import { useProject } from "../../context/project"
import { useSync } from "../../context/sync"
import { createMemo, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../config"
import { InstallationChannel, InstallationVersion } from "@spacecode/core/installation/version"
import { usePluginRuntime } from "../../plugin/runtime"
import { RGBA, TextAttributes } from "@opentui/core"

import { getScrollAcceleration } from "../../util/scroll"
import { WorkspaceLabel } from "../../component/workspace-label"

function formatStartTime(timestamp?: number): string {
  if (!timestamp) return ""
  const d = new Date(timestamp)
  const YYYY = d.getFullYear()
  const MM = String(d.getMonth() + 1).padStart(2, "0")
  const DD = String(d.getDate()).padStart(2, "0")
  const HH = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`
}

export function Sidebar(props: { sessionID: string; overlay?: boolean }) {
  const pluginRuntime = usePluginRuntime()
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const workspace = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  }
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  return (
    <Show when={session()}>
      <box
        backgroundColor={props.overlay ? theme.backgroundPanel : theme.background}
        width={36}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        border={["left"]}
        borderColor={theme.borderSubtle}
        position={props.overlay ? "absolute" : "relative"}
      >
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1}>
            <pluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
              share_url={session()!.share?.url}
            >
              <box>
                <text fg={theme.textMuted}>SESSION</text>
                <text fg={theme.text} attributes={TextAttributes.BOLD}>
                  #{props.sessionID.slice(0, 8)}
                </text>
                <text fg={theme.textMuted}>
                  started {formatStartTime(session()?.time?.created)}
                </text>
                <box height={1} marginTop={1}>
                  <text fg={theme.borderSubtle}>{"─".repeat(32)}</text>
                </box>
              </box>
            </pluginRuntime.Slot>
            <pluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />
            <pluginRuntime.Slot name="sidebar_footer" mode="single_winner" session_id={props.sessionID} />
          </box>
        </scrollbox>
      </box>
    </Show>
  )
}
