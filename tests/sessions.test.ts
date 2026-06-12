import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SessionStore, captureSetup, openSession, type SessionDeps } from '../src/main/sessions'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sam-sess-')) })

describe('SessionStore', () => {
  it('saves, gets (case-insensitive), lists, deletes', () => {
    const store = new SessionStore(join(dir, 'sessions.json'))
    store.save('Leetcode Mode', { apps: ['code'], tabs: [['https://leetcode.com']] })
    expect(store.get('leetcode mode')?.apps).toEqual(['code'])
    expect(store.list()).toEqual(['Leetcode Mode'])
    store.delete('LEETCODE MODE')
    expect(store.list()).toEqual([])
  })

  it('persists across instances', () => {
    const a = new SessionStore(join(dir, 'sessions.json'))
    a.save('x', { apps: [], tabs: [] })
    expect(new SessionStore(join(dir, 'sessions.json')).get('x')).toBeTruthy()
  })

  it('updates lastUsed on touch', () => {
    const store = new SessionStore(join(dir, 'sessions.json'))
    store.save('x', { apps: [], tabs: [] })
    const before = store.get('x')!.lastUsed
    store.touch('x', new Date(Date.now() + 60000).toISOString())
    expect(store.get('x')!.lastUsed).not.toBe(before)
  })
})

function fakeDeps(overrides: Partial<SessionDeps> = {}): SessionDeps {
  return {
    listVisibleApps: vi.fn(async () => [{ name: 'Code', title: 't' }, { name: 'Spotify', title: 't' }]),
    readTabs: vi.fn(async () => ['https://leetcode.com', 'https://neetcode.io']),
    launchApp: vi.fn(async (name: string) => ({ ok: name !== 'badapp', error: name === 'badapp' ? 'not found' : undefined })),
    openTabGroup: vi.fn(() => true),
    isRunning: vi.fn(async () => false),
    ...overrides
  }
}

describe('captureSetup', () => {
  it('captures apps and tabs', async () => {
    const r = await captureSetup(fakeDeps())
    expect(r.apps).toEqual(['Code', 'Spotify'])
    expect(r.tabs).toEqual([['https://leetcode.com', 'https://neetcode.io']])
    expect(r.warning).toBeUndefined()
  })

  it('warns and captures apps-only when tabs unreadable', async () => {
    const r = await captureSetup(fakeDeps({ readTabs: vi.fn(async () => null) }))
    expect(r.tabs).toEqual([])
    expect(r.warning).toContain('tabs')
  })
})

describe('openSession', () => {
  it('launches apps not running and opens tab groups', async () => {
    const deps = fakeDeps()
    const errors = await openSession(
      { apps: ['Code'], tabs: [['https://a.com'], ['https://b.com']], created: '', lastUsed: '' },
      deps
    )
    expect(errors).toEqual([])
    expect(deps.launchApp).toHaveBeenCalledWith('Code')
    expect(deps.openTabGroup).toHaveBeenCalledTimes(2)
  })

  it('skips apps already running', async () => {
    const deps = fakeDeps({ isRunning: vi.fn(async () => true) })
    await openSession({ apps: ['Code'], tabs: [], created: '', lastUsed: '' }, deps)
    expect(deps.launchApp).not.toHaveBeenCalled()
  })

  it('collects launch errors instead of throwing', async () => {
    const errors = await openSession(
      { apps: ['badapp'], tabs: [], created: '', lastUsed: '' },
      fakeDeps()
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('badapp')
  })
})
