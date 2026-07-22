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
- Extract app/session names ONLY from the user's message. Copy the exact word(s) the user said.
- NEVER substitute or invent a name the user did not say. If the message says "open zybatron", the app name is "zybatron".

If the message is a question, a greeting, small talk, or gibberish, do NOT call a tool — just answer.`

export type IntentChatFn = (
  messages: ChatMessage[],
  tools?: unknown[]
) => Promise<ChatResult>

/* ------------------------------------------------------------------ *
 * Guard layer 1 — shape. Commands are imperative: the verb leads the
 * message ("open spotify"), optionally behind a politeness prefix.
 * A verb buried in a noun phrase ("what are the OPEN SOURCED models")
 * is not a command — that bug opened Steam.
 * ------------------------------------------------------------------ */

/** Questions are never commands, whatever the model says. */
const QUESTION_SHAPE =
  /^(what|whats|what's|how|why|who|whom|whose|when|where|which|is|are|am|was|were|do|does|did|can|could|should|would|will|tell me|explain|define|help me understand)\b/i

/** Optional filler before the verb: "please open x", "can you open x". */
const FILLER_WORDS = String.raw`please|pls|plz|hey\s+sam|ok\s+sam|sam|can\s+you|could\s+you|would\s+you|go\s+ahead\s+and`
const LEAD_FILLER = String.raw`(?:(?:${FILLER_WORDS})[,\s]+)*`

/**
 * A polite lead-in ("can you open notepad?") is still a command, so it must
 * bypass the question-shape checks that would otherwise reject "can …".
 */
const POLITE_PREFIX = new RegExp(String.raw`^\s*(?:${FILLER_WORDS})[,\s]+`, 'i')

const COMMAND_VERB = String.raw`(?:open|launch|start|run|execute|go\s*to|goto|pull\s*up|bring\s*up|switch\s*to|save|close|quit|exit)`

const IMPERATIVE = new RegExp(`^\\s*${LEAD_FILLER}${COMMAND_VERB}\\b`, 'i')

/** Noun phrases that merely contain a command verb. */
const VERB_IN_NOUN_PHRASE =
  /\b(open[\s-]?sourced?|open[\s-]?source|openai|open[\s-]?ended|open[\s-]?minded|open[\s-]?question|start[\s-]?up|startups?)\b/i

/**
 * True only when the message reads like an imperative command. Runs before the
 * model is consulted — a question short-circuits straight to chat, which also
 * saves an API round-trip.
 */
export function looksLikeCommand(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const polite = POLITE_PREFIX.test(t)
  // "can you open spotify?" reads as a question but is a command; only apply
  // the question filters when there's no polite lead-in.
  if (!polite && t.endsWith('?')) return false
  if (!polite && QUESTION_SHAPE.test(t)) return false
  if (!IMPERATIVE.test(t)) return false
  // "open source is great" leads with a verb but isn't a command
  if (VERB_IN_NOUN_PHRASE.test(t) && !/^\s*open\s+\S+\s*$/i.test(t)) return false
  return true
}

/* ------------------------------------------------------------------ *
 * Guard layer 2 — grounding. The entity the model returns must actually
 * appear in the user's message. Stops invented targets ("steam",
 * "google.com") that were never spoken.
 * ------------------------------------------------------------------ */

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Entity is grounded if it — or any meaningful token of it — occurs in the text. */
function grounded(entity: string, text: string): boolean {
  const e = normalize(entity)
  const t = normalize(text)
  if (!e) return false
  if (t.includes(e)) return true
  // lenient: "open vs code" -> model may answer "Visual Studio Code"; "code" matches
  return e.split(' ').filter((tok) => tok.length >= 3).some((tok) => t.includes(tok))
}

function urlGrounded(url: string, text: string): boolean {
  // a literal url/domain typed by the user grounds itself
  if (/https?:\/\/|\b[\w-]+\.(com|org|net|io|dev|ai|co|app|gg|edu|gov)\b/i.test(text)) return true
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
    return grounded(host.split('.')[0], text)
  } catch {
    return false
  }
}

/** Rejects intents whose target was never mentioned by the user. */
export function isGrounded(intent: Intent, text: string): boolean {
  switch (intent.type) {
    case 'open_app':
    case 'open_session':
    case 'save_session':
      return grounded(intent.name, text)
    case 'open_urls':
      return intent.urls.length > 0 && intent.urls.every((u) => urlGrounded(u, text))
    default:
      return true
  }
}

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

/**
 * Classifies a single message. Deliberately gets NO conversation history —
 * with history the model copies entities from earlier turns ("yooo" right after
 * "open google" came back as open_urls google.com). The chat/answer path still
 * gets history; only classification is history-free.
 */
export async function parseIntent(text: string, chat: IntentChatFn): Promise<Intent> {
  // Shape gate first: questions/chat never reach the classifier at all,
  // so a hallucinated tool call can't fire and we skip an API round-trip.
  if (!looksLikeCommand(text)) return { type: 'answer' }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: text }
  ]
  const result = await chat(messages, INTENT_TOOLS)
  if (!result.toolCall) return { type: 'answer' }

  const intent = intentFromToolCall(result.toolCall)
  // Grounding gate: the target must be something the user actually said.
  if (!isGrounded(intent, text)) return { type: 'answer' }
  return intent
}
