import type { ChatMessage } from '../shared/types'

export const QUIZ_SYSTEM = `You are Sam, quizzing a student who is revising for finals.

Rules:
- Ask exactly ONE question at a time. Never ask several at once.
- Keep questions short and concrete. Prefer recall and application over trivia.
- After the student answers: say briefly whether it's right, correct any mistake in
  1-2 sentences, then immediately ask the next question.
- Do not number the questions or add headers. Just the feedback and the next question.
- If the student says "stop", "done" or "end", reply with a one-line summary of how
  they did and stop asking questions.`

/**
 * Opening turn of a quiz. `topics` are the student's own study-list items, used
 * as the syllabus so questions stay on what they actually need to revise.
 */
export function startQuizMessages(subject: string | undefined, topics: string[]): ChatMessage[] {
  const scope = subject ? `the subject "${subject}"` : 'their study list'
  const syllabus = topics.length
    ? `Their study list for this subject:\n${topics.map((t) => `- ${t}`).join('\n')}`
    : 'They have no study-list items yet, so use standard introductory material for this subject.'

  return [
    { role: 'system', content: QUIZ_SYSTEM },
    {
      role: 'user',
      content: `Quiz me on ${scope}.\n\n${syllabus}\n\nAsk your first question now — just the question, nothing else.`
    }
  ]
}
