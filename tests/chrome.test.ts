import { describe, it, expect } from 'vitest'
import { parseCdpTabs } from '../src/main/chrome'

describe('parseCdpTabs', () => {
  it('keeps only page-type http(s) urls', () => {
    const json = JSON.stringify([
      { type: 'page', url: 'https://leetcode.com/problems' },
      { type: 'page', url: 'chrome://newtab/' },
      { type: 'service_worker', url: 'https://example.com/sw.js' },
      { type: 'page', url: 'http://localhost:3000' }
    ])
    expect(parseCdpTabs(json)).toEqual([
      'https://leetcode.com/problems',
      'http://localhost:3000'
    ])
  })

  it('returns [] on garbage or non-array', () => {
    expect(parseCdpTabs('nope')).toEqual([])
    expect(parseCdpTabs('{}')).toEqual([])
  })
})
