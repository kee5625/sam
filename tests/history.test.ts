import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { History } from '../src/main/history'

let file: string
beforeEach(() => { file = join(mkdtempSync(join(tmpdir(), 'sam-hist-')), 'history.json') })

describe('History', () => {
  it('adds and returns recent messages in order', () => {
    const h = new History(file)
    h.add('user', 'q1')
    h.add('assistant', 'a1')
    expect(h.recent(2)).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' }
    ])
  })

  it('caps at 50 messages', () => {
    const h = new History(file)
    for (let i = 0; i < 60; i++) h.add('user', `m${i}`)
    expect(h.recent(100)).toHaveLength(50)
    expect(h.recent(1)[0].content).toBe('m59')
  })

  it('persists to disk and reloads', () => {
    const h = new History(file)
    h.add('user', 'remember me')
    expect(new History(file).recent(1)[0].content).toBe('remember me')
  })
})
