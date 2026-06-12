import type { ChatMessage } from '../../shared/types'
import type { ChatResult } from './groq'

export interface Provider {
  name: string
  hasKey(): boolean
  chat(messages: ChatMessage[], opts?: { tools?: unknown[]; signal?: AbortSignal }): Promise<ChatResult>
  chatStream(messages: ChatMessage[], onToken: (t: string) => void, signal?: AbortSignal): Promise<void>
}

export class AIRouter {
  constructor(
    private primary: Provider | null,
    private fallback: Provider | null,
    private timeoutMs = 30000
  ) {}

  private providers(): Provider[] {
    return [this.primary, this.fallback].filter(
      (p): p is Provider => p !== null && p.hasKey()
    )
  }

  /** Tries primary twice (1 retry), then fallback once. Each attempt gets a fresh timeout. */
  private async attempt<T>(fn: (p: Provider, signal: AbortSignal) => Promise<T>): Promise<T> {
    const ps = this.providers()
    if (ps.length === 0) throw new Error('No API key configured — open settings to add one')
    let lastErr: unknown
    const plan = ps.length > 1 ? [ps[0], ps[0], ps[1]] : [ps[0], ps[0]]
    for (const p of plan) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
      try {
        return await fn(p, ctrl.signal)
      } catch (e) {
        lastErr = e
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  chat(messages: ChatMessage[], tools?: unknown[]): Promise<ChatResult> {
    return this.attempt((p, signal) => p.chat(messages, { tools, signal }))
  }

  chatStream(messages: ChatMessage[], onToken: (t: string) => void): Promise<void> {
    return this.attempt((p, signal) => p.chatStream(messages, onToken, signal))
  }
}
