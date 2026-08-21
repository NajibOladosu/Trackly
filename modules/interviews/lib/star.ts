/**
 * Pure helpers for the STAR (Situation, Task, Action, Result) answer builder.
 * Persistence lives in the UI (localStorage); these functions are side-effect free.
 */

export interface StarParts {
  situation: string
  task: string
  action: string
  result: string
}

export interface StarAnswer extends StarParts {
  id: string
  question: string
  createdAt: string
  updatedAt: string
}

export const STAR_SECTIONS: Array<{ key: keyof StarParts; label: string; hint: string }> = [
  { key: "situation", label: "Situation", hint: "Set the scene — where were you and what was the context?" },
  { key: "task", label: "Task", hint: "What was your responsibility or the challenge you had to address?" },
  { key: "action", label: "Action", hint: "What specific steps did YOU take? Use 'I', not 'we'." },
  { key: "result", label: "Result", hint: "What was the outcome? Quantify it where you can." },
]

/** Join the filled sections into a readable, paragraph-style answer. */
export function composeStarAnswer(parts: StarParts): string {
  return [parts.situation, parts.task, parts.action, parts.result]
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n")
}

/** Fraction (0–1) of the four STAR sections that have content. */
export function starCompleteness(parts: StarParts): number {
  const filled = [parts.situation, parts.task, parts.action, parts.result].filter(
    (section) => section.trim().length > 0
  ).length
  return filled / 4
}

/** True when all four sections are filled. */
export function isStarComplete(parts: StarParts): boolean {
  return starCompleteness(parts) === 1
}
