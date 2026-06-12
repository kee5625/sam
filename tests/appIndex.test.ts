import { describe, it, expect } from 'vitest'
import { parseStartApps, findApp } from '../src/main/appIndex'
import type { AppEntry } from '../src/shared/types'

const APPS: AppEntry[] = [
  { name: 'Spotify', appId: 'Spotify.exe' },
  { name: 'Visual Studio Code', appId: 'Microsoft.VisualStudioCode' },
  { name: 'Google Chrome', appId: 'Chrome' },
  { name: 'Calculator', appId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' }
]

describe('parseStartApps', () => {
  it('parses an array of entries', () => {
    const json = JSON.stringify([{ Name: 'Spotify', AppID: 'Spotify.exe' }])
    expect(parseStartApps(json)).toEqual([{ name: 'Spotify', appId: 'Spotify.exe' }])
  })

  it('handles single-object output (ConvertTo-Json collapses one element)', () => {
    const json = JSON.stringify({ Name: 'Spotify', AppID: 'Spotify.exe' })
    expect(parseStartApps(json)).toEqual([{ name: 'Spotify', appId: 'Spotify.exe' }])
  })

  it('returns [] on garbage', () => {
    expect(parseStartApps('not json')).toEqual([])
  })
})

describe('findApp', () => {
  it('exact match wins', () => {
    expect(findApp('spotify', APPS).match?.name).toBe('Spotify')
  })

  it('substring match works', () => {
    expect(findApp('chrome', APPS).match?.name).toBe('Google Chrome')
  })

  it('token-prefix match: "vs code" finds Visual Studio Code', () => {
    expect(findApp('vs code', APPS).match?.name).toBe('Visual Studio Code')
  })

  it('no match returns up to 3 suggestions and no match', () => {
    const r = findApp('zzz nonexistent', APPS)
    expect(r.match).toBeUndefined()
    expect(r.suggestions.length).toBeLessThanOrEqual(3)
  })
})
