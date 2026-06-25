import type { ChatMessage, Intent } from '../../shared/types'
import type { ChatResult, ToolCall } from './groq'

export const INTENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Launch an application installed on this Windows machine',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'App name as the user said it' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_urls',
      description: 'Open one or more URLs in the browser',
      parameters: {
        type: 'object',
        properties: { urls: { type: 'array', items: { type: 'string' } } },
        required: ['urls']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_session',
      description: 'Open a saved workflow session (a named combo of apps and browser tabs)',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_session',
      description: 'Save the currently open apps and browser tabs as a named session',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  }
]

const SYSTEM_PROMPT = `You are Sam, a Windows desktop assistant.
Decide whether the user's LATEST message is a command (use a tool) or a question/chat (no tool).
Commands: opening apps, opening websites/urls, opening or saving named workflow sessions.
"open X mode" or "start X mode" refers to a saved session named "X mode".

Critical rules for tool arguments:
- Extract app/session names ONLY from the user's latest message. Copy the exact word(s) the user said.
- NEVER substitute, guess, or reuse a name from earlier messages in the conversation. If the latest message says "open zybatron", the app name is "zybatron" — not some app mentioned earlier.
- Earlier turns are background only; they must not change the name you extract from the current command.

If the user asks a question or chats, do NOT call a tool — just answer.`

export type IntentChatFn = (
  messages: ChatMessage[],
  tools?: unknown[]
) => Promise<ChatResult>

export function intentFromToolCall(tc: ToolCall): Intent {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(tc.arguments)
  } catch {
    return { type: 'answer' }
  }
  switch (tc.name) {
    case 'open_app':
      return typeof args.name === 'string' ? { type: 'open_app', name: args.name } : { type: 'answer' }
    case 'open_urls':
      return Array.isArray(args.urls) ? { type: 'open_urls', urls: args.urls.map(String) } : { type: 'answer' }
    case 'open_session':
      return typeof args.name === 'string' ? { type: 'open_session', name: args.name } : { type: 'answer' }
    case 'save_session':
      return typeof args.name === 'string' ? { type: 'save_session', name: args.name } : { type: 'answer' }
    default:
      return { type: 'answer' }
  }
}

export async function parseIntent(
  text: string,
  history: ChatMessage[],
  chat: IntentChatFn
): Promise<Intent> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: text }
  ]
  const result = await chat(messages, INTENT_TOOLS)
  if (result.toolCall) return intentFromToolCall(result.toolCall)
  return { type: 'answer' }
}
