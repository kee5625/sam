import { describe, it, expect, vi } from 'vitest'
import { intentFromToolCall, parseIntent, INTENT_TOOLS, looksLikeCommand, isGrounded } from '../src/main/ai/intent'
import type { ChatResult } from '../src/main/ai/groq'

describe('looksLikeCommand', () => {
  it('accepts imperative commands', () => {
    for (const t of [
      'open spotify', 'Open Spotify.', 'launch vs code', 'start work mode',
      'please open chrome', 'hey sam, open discord', 'can you open notepad',
      'go to leetcode.com', 'save this as work mode', 'close spotify'
    ]) expect(looksLikeCommand(t), t).toBe(true)
  })

  it('rejects questions even when they contain a command verb', () => {
    for (const t of [
      'what are the open sourced models that are best for this',
      'what open source model should i run?',
      'how do i open a file in vim',
      'is it better to start with rust or go',
      'why does chrome run so slow',
      'which model should i use?',
      'explain how sessions save state'
    ]) expect(looksLikeCommand(t), t).toBe(false)
  })

  it('rejects chat and gibberish', () => {
    for (const t of ['yooo', 'hey', 'thanks!', 'lol that worked', ''])
      expect(looksLikeCommand(t), t).toBe(false)
  })

  it('rejects verbs buried in noun phrases', () => {
    expect(looksLikeCommand('open source is great')).toBe(false)
    expect(looksLikeCommand('openai released something')).toBe(false)
    expect(looksLikeCommand('startups are hard')).toBe(false)
  })
})

describe('isGrounded', () => {
  it('accepts targets the user actually named', () => {
    expect(isGrounded({ type: 'open_app', name: 'spotify' }, 'open spotify')).toBe(true)
    expect(isGrounded({ type: 'open_app', name: 'Visual Studio Code' }, 'open vs code')).toBe(true)
    expect(isGrounded({ type: 'open_session', name: 'work mode' }, 'start work mode')).toBe(true)
  })

  it('rejects invented targets', () => {
    expect(isGrounded({ type: 'open_app', name: 'steam' }, 'open sourced models')).toBe(false)
    expect(isGrounded({ type: 'open_app', name: 'calculator' }, 'open zybatron')).toBe(false)
  })

  it('grounds urls by domain or literal url in the text', () => {
    expect(isGrounded({ type: 'open_urls', urls: ['https://leetcode.com'] }, 'go to leetcode')).toBe(true)
    expect(isGrounded({ type: 'open_urls', urls: ['https://neetcode.io'] }, 'open neetcode.io')).toBe(true)
    expect(isGrounded({ type: 'open_urls', urls: ['https://google.com'] }, 'open spotify')).toBe(false)
  })
})

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
  it('returns tool intent when model calls a tool on a command', async () => {
    const chat = async (): Promise<ChatResult> => ({
      content: null,
      toolCall: { name: 'open_app', arguments: '{"name":"spotify"}' }
    })
    expect(await parseIntent('open spotify', chat)).toEqual({ type: 'open_app', name: 'spotify' })
  })

  it('returns answer when model replies with plain content', async () => {
    const chat = async (): Promise<ChatResult> => ({ content: 'hello!', toolCall: null })
    expect(await parseIntent('what is rust', chat)).toEqual({ type: 'answer' })
  })

  it('never consults the model for non-commands', async () => {
    const chat = vi.fn(async (): Promise<ChatResult> => ({
      content: null,
      toolCall: { name: 'open_urls', arguments: '{"urls":["https://google.com"]}' }
    }))
    expect(await parseIntent('yooo', chat)).toEqual({ type: 'answer' })
    expect(await parseIntent('what are the open sourced models', chat)).toEqual({ type: 'answer' })
    expect(chat).not.toHaveBeenCalled()
  })

  it('drops a tool call whose target the user never mentioned', async () => {
    const chat = async (): Promise<ChatResult> => ({
      content: null,
      toolCall: { name: 'open_app', arguments: '{"name":"steam"}' }
    })
    expect(await parseIntent('open zybatron', chat)).toEqual({ type: 'answer' })
  })

  it('still honours real commands with varied verbs', async () => {
    const chat = async (): Promise<ChatResult> => ({
      content: null,
      toolCall: { name: 'open_session', arguments: '{"name":"work mode"}' }
    })
    expect(await parseIntent('start work mode', chat)).toEqual({ type: 'open_session', name: 'work mode' })
    expect(await parseIntent('launch work mode', chat)).toEqual({ type: 'open_session', name: 'work mode' })
  })

  it('sends tools and only the current message — never prior turns', async () => {
    let captured: { messages: { role: string; content: string }[]; tools?: unknown[] } | null = null
    const chat = async (messages: unknown[], tools?: unknown[]): Promise<ChatResult> => {
      captured = { messages: messages as { role: string; content: string }[], tools }
      return { content: 'x', toolCall: null }
    }
    await parseIntent('hi', chat)
    expect(captured!.tools).toBe(INTENT_TOOLS)
    expect(captured!.messages).toHaveLength(2)
    expect(captured!.messages[1]).toEqual({ role: 'user', content: 'hi' })
  })
})
