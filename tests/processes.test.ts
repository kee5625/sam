import { describe, it, expect } from 'vitest'
import { parseVisibleProcesses } from '../src/main/processes'

describe('parseVisibleProcesses', () => {
  it('parses array output and keeps name+title', () => {
    const json = JSON.stringify([
      { Name: 'Code', MainWindowTitle: 'main.ts - sam' },
      { Name: 'Spotify', MainWindowTitle: 'Spotify Premium' }
    ])
    expect(parseVisibleProcesses(json)).toEqual([
      { name: 'Code', title: 'main.ts - sam' },
      { name: 'Spotify', title: 'Spotify Premium' }
    ])
  })

  it('filters out shell noise processes', () => {
    const json = JSON.stringify([
      { Name: 'explorer', MainWindowTitle: 'x' },
      { Name: 'TextInputHost', MainWindowTitle: 'x' },
      { Name: 'ApplicationFrameHost', MainWindowTitle: 'x' },
      { Name: 'SystemSettings', MainWindowTitle: 'x' },
      { Name: 'Spotify', MainWindowTitle: 'Spotify' }
    ])
    expect(parseVisibleProcesses(json).map((p) => p.name)).toEqual(['Spotify'])
  })

  it('dedupes multi-window processes', () => {
    const json = JSON.stringify([
      { Name: 'chrome', MainWindowTitle: 'a' },
      { Name: 'chrome', MainWindowTitle: 'b' }
    ])
    expect(parseVisibleProcesses(json)).toHaveLength(1)
  })

  it('handles single object and garbage', () => {
    expect(parseVisibleProcesses(JSON.stringify({ Name: 'Code', MainWindowTitle: 't' }))).toHaveLength(1)
    expect(parseVisibleProcesses('garbage')).toEqual([])
  })
})
