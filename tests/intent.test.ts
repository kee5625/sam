import { describe, it, expect } from 'vitest'
import { intentFromToolCall, parseIntent, INTENT_TOOLS } from '../src/main/ai/intent'
import type { ChatResult } from '../src/main/ai/groq'

describe('intentFromToolCall', () => {
  it('maps each tool to an intent', () => {
    expect(intentFromToolCall({ name: 'open_app', arguments: '{"name":"spotify"}' }))
      .toEqual({ type: 'open_app', name: 'spotify' })
    expect(intentFromToolCall({ name: 'open_urls', arguments: '{"urls":["https://a.com"]}' }))
      .toEqual({ type: 'open_urls', urls: ['https://a.com'] })
    expect(intentFromToolCall({ name: 'open_session', arguments: '{"name":"leetcode mode"}' }))
      .toEqual({ type: 'open_session', name: 'leetcode mode' })
    expect(intentFromToolCall({ name: 'save_session', arguments: '{"name":"work"}' }))
      .toEqual({ type: 'save_session', name: 'work' })
  })

  it('falls back to answer on unknown tool or malformed args', () => {
    expect(intentFromToolCall({ name: 'nope', arguments: '{}' })).toEqual({ type: 'answer' })
    expect(intentFromToolCall({ name: 'open_app', arguments: 'not json' })).toEqual({ type: 'answer' })
    expect(intentFromToolCall({ name: 'open_app', arguments: '{}' })).toEqual({ type: 'answer' })
  })
})

describe('parseIntent', () => {
  it('returns tool intent when model calls a tool', async () => {
    const chat = async (): Promise<ChatResult> => ({
      content: null,
      toolCall: { name: 'open_app', arguments: '{"name":"spotify"}' }
    })
    expect(await parseIntent('open spotify', [], chat)).toEqual({ type: 'open_app', name: 'spotify' })
  })

  it('returns answer when model replies with plain content', async () => {
    const chat = async (): Promise<ChatResult> => ({ content: 'hello!', toolCall: null })
    expect(await parseIntent('what is rust', [], chat)).toEqual({ type: 'answer' })
  })

  it('sends tools and history to the chat function', async () => {
    let captured: { messages: unknown[]; tools?: unknown[] } | null = null
    const chat = async (messages: unknown[], tools?: unknown[]): Promise<ChatResult> => {
      captured = { messages, tools }
      return { content: 'x', toolCall: null }
    }
    await parseIntent('hi', [{ role: 'user', content: 'earlier' }], chat)
    expect(captured!.tools).toBe(INTENT_TOOLS)
    expect((captured!.messages as { content: string }[]).some((m) => m.content === 'earlier')).toBe(true)
  })
})
