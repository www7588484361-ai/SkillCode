import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Todo } from "../session/todo"

export const StepStatus = Schema.Literals(["pending", "in_progress", "completed"])

export const PlanItem = Schema.Struct({
  step: Schema.String.annotate({ description: "Task step description text" }),
  status: StepStatus.annotate({
    description: "Step status: 'pending', 'in_progress', or 'completed'. At most one step should be in_progress.",
  }),
})

export const Parameters = Schema.Struct({
  explanation: Schema.optional(Schema.String).annotate({
    description: "Optional explanation for this plan update.",
  }),
  plan: Schema.mutable(Schema.Array(PlanItem)).annotate({
    description: "The list of plan steps outlining multi-file modifications and progress.",
  }),
})

type Metadata = {
  explanation?: string
  plan: Array<Schema.Schema.Type<typeof PlanItem>>
  completed: number
  inProgress: number
  pending: number
}

export const UpdatePlanTool = Tool.define<typeof Parameters, Metadata, Todo.Service>(
  "update_plan",
  Effect.gen(function* () {
    const todo = yield* Todo.Service

    return {
      description:
        "Updates the multi-file task execution plan. Provide an optional explanation and a list of plan items, each with a step and status ('pending', 'in_progress', or 'completed'). At most one step should be in_progress at a time. Use this to stage and track multi-file refactors cleanly.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "update_plan",
            patterns: ["*"],
            always: ["*"],
            metadata: { explanation: params.explanation },
          })

          // Sync with session Todo service
          const todoItems: Todo.Info[] = params.plan.map((item, idx) => ({
            id: `plan_${idx + 1}`,
            content: item.step,
            status: item.status === "in_progress" ? "in_progress" : item.status === "completed" ? "completed" : "pending",
            priority: "medium",
          }))

          yield* todo.update({
            sessionID: ctx.sessionID,
            todos: todoItems,
          }).pipe(Effect.catch(() => Effect.void))

          const completed = params.plan.filter((x) => x.status === "completed").length
          const inProgress = params.plan.filter((x) => x.status === "in_progress").length
          const pending = params.plan.filter((x) => x.status === "pending").length

          const lines: string[] = []
          if (params.explanation) {
            lines.push(`Plan update: ${params.explanation}`)
            lines.push("")
          }
          lines.push(`Progress: ${completed}/${params.plan.length} completed (${inProgress} in progress)`)
          lines.push("")

          for (const item of params.plan) {
            const icon = item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[>]" : "[ ]"
            lines.push(`${icon} ${item.step}`)
          }

          return {
            title: `Plan updated (${completed}/${params.plan.length} completed)`,
            output: lines.join("\n"),
            metadata: {
              explanation: params.explanation,
              plan: params.plan,
              completed,
              inProgress,
              pending,
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
