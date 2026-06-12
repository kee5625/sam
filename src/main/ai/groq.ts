import { parseSseBuffer, extractDelta } from './sse'
import type { ChatMessage } from '../../shared/types'

const BASE = 'https://api.groq.com/openai/v1'
const CHAT_MODEL = 'llama-3.3-70b-versatile'
const STT_MODEL = 'whisper-large-v3-turbo'

export interface ToolCall {
  name: string
  arguments: string
}

export interface ChatResult {
  content: string | null
  toolCall: ToolCall | null
}

export class GroqClient {
  readonly name = 'groq'
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
        model: CHAT_MODEL,
        messages,
        ...(opts.tools ? { tools: opts.tools, tool_choice: 'auto' } : {})
      }),
      signal: opts.signal
    })
    if (!res.ok) throw new Error(`groq chat ${res.status}: ${await res.text()}`)
    const j = await res.json()
    const msg = j.choices?.[0]?.message
    const tc = msg?.tool_calls?.[0]?.function
    return {
      content: msg?.content ?? null,
      toolCall: tc ? { name: tc.name, arguments: tc.arguments } : null
    }
  }

  async chatStream(
    messages: ChatMessage[],
    onToken: (t: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true }),
      signal
    })
    if (!res.ok || !res.body) throw new Error(`groq stream ${res.status}: ${await res.text()}`)
    const reader = res.body.getReader()
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

  async transcribe(audio: ArrayBuffer, signal?: AbortSignal): Promise<string> {
    const fd = new FormData()
    fd.append('file', new Blob([audio], { type: 'audio/webm' }), 'audio.webm')
    fd.append('model', STT_MODEL)
    const res = await fetch(`${BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: fd,
      signal
    })
    if (!res.ok) throw new Error(`groq stt ${res.status}: ${await res.text()}`)
    const j = await res.json()
    return (j.text ?? '').trim()
  }
}
