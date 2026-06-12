import { describe, it, expect, vi } from 'vitest'
import { AIRouter, type Provider } from '../src/main/ai/router'

function provider(name: string, fail = false): Provider {
  return {
    name,
    hasKey: () => true,
    chat: vi.fn(async () => {
      if (fail) throw new Error(`${name} down`)
      return { content: `from ${name}`, toolCall: null }
    }),
    chatStream: vi.fn(async (_m, onToken: (t: string) => void) => {
      if (fail) throw new Error(`${name} down`)
      onToken(`from ${name}`)
    })
  }
}

describe('AIRouter', () => {
  it('uses primary when healthy', async () => {
    const p = provider('groq')
    const router = new AIRouter(p, provider('openai'))
    const r = await router.chat([])
    expect(r.content).toBe('from groq')
    expect(p.chat).toHaveBeenCalledTimes(1)
  })

  it('retries primary once, then falls back', async () => {
    const p = provider('groq', true)
    const f = provider('openai')
    const router = new AIRouter(p, f)
    const r = await router.chat([])
    expect(p.chat).toHaveBeenCalledTimes(2)
    expect(r.content).toBe('from openai')
  })

  it('throws descriptive error when all providers fail', async () => {
    const router = new AIRouter(provider('groq', true), provider('openai', true))
    await expect(router.chat([])).rejects.toThrow(/openai down/)
  })

  it('throws no-key error when no provider has a key', async () => {
    const dead: Provider = { ...provider('groq'), hasKey: () => false }
    const router = new AIRouter(dead, null)
    await expect(router.chat([])).rejects.toThrow(/API key/i)
  })

  it('streams through fallback too', async () => {
    const router = new AIRouter(provider('groq', true), provider('openai'))
    const tokens: string[] = []
    await router.chatStream([], (t) => tokens.push(t))
    expect(tokens).toEqual(['from openai'])
  })

  it('aborts slow calls at timeout', async () => {
    const slow: Provider = {
      name: 'slow',
      hasKey: () => true,
      chat: (_m, opts) =>
        new Promise((_res, rej) => {
          opts?.signal?.addEventListener('abort', () => rej(new Error('aborted')))
        }),
      chatStream: async () => {}
    }
    const router = new AIRouter(slow, null, 50)
    await expect(router.chat([])).rejects.toThrow(/aborted/)
  })
})
