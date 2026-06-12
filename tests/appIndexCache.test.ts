import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadAppIndex } from '../src/main/appIndex'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sam-idx-')) })

const FRESH = [{ name: 'Spotify', appId: 'Spotify.exe' }]

describe('loadAppIndex', () => {
  it('calls fetcher and writes cache when no cache exists', async () => {
    const fetcher = vi.fn(async () => FRESH)
    const result = await loadAppIndex(dir, fetcher)
    expect(result).toEqual(FRESH)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('uses cache when fresh (< 24h)', async () => {
    writeFileSync(
      join(dir, 'app-index.json'),
      JSON.stringify({ updated: Date.now(), apps: FRESH })
    )
    const fetcher = vi.fn(async () => [])
    const result = await loadAppIndex(dir, fetcher)
    expect(result).toEqual(FRESH)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refreshes when cache is stale (> 24h)', async () => {
    writeFileSync(
      join(dir, 'app-index.json'),
      JSON.stringify({ updated: Date.now() - 25 * 3600 * 1000, apps: [] })
    )
    const fetcher = vi.fn(async () => FRESH)
    const result = await loadAppIndex(dir, fetcher)
    expect(result).toEqual(FRESH)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('does not cache an empty fetch result', async () => {
    const { existsSync } = await import('fs')
    const fetcher = vi.fn(async () => [])
    const result = await loadAppIndex(dir, fetcher)
    expect(result).toEqual([])
    expect(existsSync(join(dir, 'app-index.json'))).toBe(false)
  })

  it('prefers stale cache over an empty fetch result', async () => {
    writeFileSync(
      join(dir, 'app-index.json'),
      JSON.stringify({ updated: 0, apps: FRESH })
    )
    const result = await loadAppIndex(dir, vi.fn(async () => []))
    expect(result).toEqual(FRESH)
  })

  it('falls back to stale cache if fetcher throws', async () => {
    writeFileSync(
      join(dir, 'app-index.json'),
      JSON.stringify({ updated: 0, apps: FRESH })
    )
    const fetcher = vi.fn(async () => { throw new Error('ps failed') })
    const result = await loadAppIndex(dir, fetcher)
    expect(result).toEqual(FRESH)
  })
})
