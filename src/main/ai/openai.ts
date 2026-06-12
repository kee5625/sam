import { parseSseBuffer, extractDelta } from './sse'
import type { ChatMessage } from '../../shared/types'
import type { ChatResult } from './groq'

const BASE = 'https://api.openai.com/v1'
const MODEL = 'gpt-4o-mini'

async function streamBody(
  res: Response,
  onToken: (t: string) => void
): Promise<void> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const { events, rest } = parseSseBuffer(buf)
    buf = rest
    for (const ev of events) {
      const delta = extractDelta(ev)
      if (delta) onToken(delta)
    }
  }
}

export class OpenAIClient {
  readonly name = 'openai'
  constructor(private apiKey: string) {}

  hasKey(): boolean {
    return this.apiKey.length > 0
  }

  async chat(
    messages: ChatMessage[],
    opts: { tools?: unknown[]; signal?: AbortSignal } = {}
  ): Promise<ChatResult> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        ...(opts.tools ? { tools: opts.tools, tool_choice: 'auto' } : {})
      }),
      signal: opts.signal
    })
    if (!res.ok) throw new Error(`openai chat ${res.status}: ${await res.text()}`)
    const j = await res.json()
    const msg = j.choices?.[0]?.message
    const tc = msg?.tool_calls?.[0]?.function
    return {
      content: msg?.content ?? null,
      toolCall: tc ? { name: tc.name, arguments: tc.arguments } : null
    }
  }

  /** Streams an answer about an image (data URL) — the snip Q&A path. */
  async visionStream(
    question: string,
    imageDataUrl: string,
    onToken: (t: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          }
        ]
      }),
      signal
    })
    if (!res.ok || !res.body) throw new Error(`openai vision ${res.status}: ${await res.text()}`)
    await streamBody(res, onToken)
  }

  async chatStream(
    messages: ChatMessage[],
    onToken: (t: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, stream: true }),
      signal
    })
    if (!res.ok || !res.body) throw new Error(`openai stream ${res.status}: ${await res.text()}`)
    await streamBody(res, onToken)
  }
}
