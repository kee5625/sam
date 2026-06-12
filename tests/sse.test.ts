import { describe, it, expect } from 'vitest'
import { parseSseBuffer, extractDelta } from '../src/main/ai/sse'

describe('parseSseBuffer', () => {
  it('extracts complete events and keeps the partial remainder', () => {
    const buf = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"part'
    const { events, rest } = parseSseBuffer(buf)
    expect(events).toEqual(['{"a":1}', '{"b":2}'])
    expect(rest).toBe('data: {"part')
  })

  it('drops [DONE] sentinel', () => {
    const { events } = parseSseBuffer('data: [DONE]\n\n')
    expect(events).toEqual([])
  })

  it('handles CRLF', () => {
    const { events } = parseSseBuffer('data: {"a":1}\r\n\r\n')
    expect(events).toEqual(['{"a":1}'])
  })
})

describe('extractDelta', () => {
  it('pulls streamed token text', () => {
    expect(extractDelta('{"choices":[{"delta":{"content":"hi"}}]}')).toBe('hi')
  })

  it('returns null for non-content chunks or bad json', () => {
    expect(extractDelta('{"choices":[{"delta":{}}]}')).toBeNull()
    expect(extractDelta('garbage')).toBeNull()
  })
})
