import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ConfigStore, DEFAULT_CONFIG } from '../src/main/config'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sam-cfg-')) })

describe('ConfigStore', () => {
  it('returns defaults when no file exists', () => {
    const store = new ConfigStore(dir)
    expect(store.load()).toEqual(DEFAULT_CONFIG)
  })

  it('persists and reloads values', () => {
    const store = new ConfigStore(dir)
    const cfg = { ...DEFAULT_CONFIG, groqApiKey: 'gsk_test' }
    store.save(cfg)
    expect(new ConfigStore(dir).load().groqApiKey).toBe('gsk_test')
  })

  it('merges defaults into partial files (forward compat)', () => {
    const store = new ConfigStore(dir)
    store.save({ ...DEFAULT_CONFIG, openaiApiKey: 'sk-x' })
    const raw = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
    delete raw.hotkeys
    writeFileSync(join(dir, 'config.json'), JSON.stringify(raw))
    const loaded = new ConfigStore(dir).load()
    expect(loaded.hotkeys).toEqual(DEFAULT_CONFIG.hotkeys)
    expect(loaded.openaiApiKey).toBe('sk-x')
  })
})
