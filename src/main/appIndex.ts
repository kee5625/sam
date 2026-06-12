import { execFile } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppEntry } from '../shared/types'

export function parseStartApps(json: string): AppEntry[] {
  try {
    const data = JSON.parse(json)
    const arr = Array.isArray(data) ? data : [data]
    return arr
      .filter((x) => x && typeof x.Name === 'string' && typeof x.AppID === 'string')
      .map((x) => ({ name: x.Name, appId: x.AppID }))
  } catch {
    return []
  }
}

function score(query: string, name: string): number {
  const q = query.toLowerCase().trim()
  const n = name.toLowerCase()
  if (n === q) return 100
  if (n.startsWith(q)) return 80
  if (n.includes(q)) return 60
  const qTokens = q.split(/\s+/)
  const nTokens = n.split(/\s+/)
  // each query token must prefix a name token, or be an acronym of name tokens
  // ("vs code" -> initials "vsc" covers "vs", "code" prefixes "code")
  const initials = nTokens.map((w) => w[0]).join('')
  if (qTokens.every((t) => nTokens.some((w) => w.startsWith(t)) || initials.includes(t))) return 50
  // weak: any shared token prefix at all (suggestion-only territory)
  if (qTokens.some((t) => nTokens.some((w) => w.startsWith(t.slice(0, 3)) && t.length >= 3))) return 20
  return 0
}

export function findApp(
  query: string,
  apps: AppEntry[]
): { match?: AppEntry; suggestions: AppEntry[] } {
  const scored = apps
    .map((a) => ({ a, s: score(query, a.name) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
  const suggestions = scored.slice(0, 3).map((x) => x.a)
  if (scored.length > 0 && scored[0].s >= 50) return { match: scored[0].a, suggestions }
  return { suggestions }
}

const CACHE_TTL_MS = 24 * 3600 * 1000

/** Default fetcher: queries Windows for all Start Menu / UWP apps. */
export function fetchStartApps(): Promise<AppEntry[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Get-StartApps | ConvertTo-Json -Compress'],
      { maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) return reject(err)
        resolve(parseStartApps(stdout))
      }
    )
  })
}

export async function loadAppIndex(
  cacheDir: string,
  fetcher: () => Promise<AppEntry[]> = fetchStartApps
): Promise<AppEntry[]> {
  const cacheFile = join(cacheDir, 'app-index.json')
  let cached: { updated: number; apps: AppEntry[] } | null = null
  if (existsSync(cacheFile)) {
    try {
      cached = JSON.parse(readFileSync(cacheFile, 'utf8'))
    } catch {
      cached = null
    }
  }
  if (cached && Date.now() - cached.updated < CACHE_TTL_MS) return cached.apps
  try {
    const apps = await fetcher()
    writeFileSync(cacheFile, JSON.stringify({ updated: Date.now(), apps }))
    return apps
  } catch {
    if (cached) return cached.apps
    return []
  }
}
