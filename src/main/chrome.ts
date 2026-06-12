import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export const CDP_PORT = 9222

export function parseCdpTabs(json: string): string[] {
  try {
    const data = JSON.parse(json)
    if (!Array.isArray(data)) return []
    return data
      .filter((t) => t && t.type === 'page' && typeof t.url === 'string' && /^https?:\/\//.test(t.url))
      .map((t) => t.url)
  } catch {
    return []
  }
}

/** Reads open tabs via CDP. Returns null if Chrome isn't reachable on the debug port. */
export async function readOpenTabs(port = CDP_PORT): Promise<string[] | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return parseCdpTabs(await res.text())
  } catch {
    return null
  }
}

export function findChromePath(): string | null {
  const candidates = [
    join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['LOCALAPPDATA'] ?? '', 'Google/Chrome/Application/chrome.exe')
  ]
  for (const p of candidates) if (p && existsSync(p)) return p
  return null
}

/** Opens one group of urls as a new Chrome window, with the debug port enabled. */
export function openTabGroup(urls: string[], chromePath = findChromePath()): boolean {
  if (urls.length === 0) return true
  if (!chromePath) return false
  const child = spawn(
    chromePath,
    [`--remote-debugging-port=${CDP_PORT}`, '--new-window', ...urls],
    { detached: true, stdio: 'ignore' }
  )
  child.unref()
  return true
}
