import { useTheme } from "../context/theme"

export interface TodoItemProps {
  status: string
  content: string
}

export function TodoItem(props: TodoItemProps) {
  const { theme } = useTheme()
  const isCompleted = () => props.status === "completed"
  const isInProgress = () => props.status === "in_progress"

  return (
    <box flexDirection="row" gap={0}>
      <text
        flexShrink={0}
        style={{
          fg: isCompleted() ? theme.success : isInProgress() ? theme.primary : theme.textMuted,
        }}
      >
        {isCompleted() ? "✓ " : isInProgress() ? "◉ " : "○ "}
      </text>
      <text
        flexGrow={1}
        wrapMode="word"
        style={{
          fg: isInProgress() ? theme.text : theme.textMuted,
        }}
      >
        {props.content}
      </text>
    </box>
  )
}
