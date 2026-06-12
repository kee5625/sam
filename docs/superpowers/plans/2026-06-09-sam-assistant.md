# Sam Desktop AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Sam — a Windows-only Electron overlay assistant with voice commands, app/session launching, Chrome tab control, and region-snip vision Q&A.

**Architecture:** Electron main process hosts all OS services (hotkeys, app index, launcher, Chrome CDP bridge, session store, AI router); three renderer windows (overlay pill bar, snip, settings) talk to it over IPC. Pure logic lives in dependency-injected modules tested with Vitest; OS glue is verified by a manual smoke checklist.

**Tech Stack:** Electron 33, electron-vite, TypeScript, React 18, Vitest, Groq REST API (whisper-large-v3-turbo + llama-3.3-70b-versatile), OpenAI REST API (gpt-4o-mini vision), marked.

> **IMPORTANT — no git commands.** The user commits manually. Do NOT run `git add`/`git commit`/any git command. Plan tasks therefore contain no commit steps; stop at "tests pass".

> **Spec deviation (approved):** Push-to-talk is tap-to-toggle only in v1 (Electron `globalShortcut` has no key-up event). Hold-to-talk would require `uiohook-napi`; deferred.

**Spec:** `docs/superpowers/specs/2026-06-09-sam-assistant-design.md`

---

## File structure

```
package.json, tsconfig.json, tsconfig.node.json, electron.vite.config.ts, vitest.config.ts
src/shared/types.ts            — Config, Session, Intent, AppEntry, IPC payload types
src/main/index.ts              — entry: windows, hotkeys, ipc, permission handler
src/main/windows.ts            — overlay/snip/settings BrowserWindow factories
src/main/hotkeys.ts            — globalShortcut registration with conflict reporting
src/main/ipc.ts                — all ipcMain handlers; pipeline: submit → intent → action
src/main/config.ts             — config.json load/save (testable, fs-backed)
src/main/appIndex.ts           — Get-StartApps parse + fuzzy matcher + daily cache
src/main/launcher.ts           — launch via explorer shell:AppsFolder
src/main/processes.ts          — visible-window process list via PowerShell
src/main/chrome.ts             — CDP tab read, chrome path discovery, open tab groups
src/main/sessions.ts           — SessionStore + captureSetup/openSession (deps injected)
src/main/capture.ts            — desktopCapturer full-screen grab
src/main/history.ts            — rolling chat history
src/main/ai/sse.ts             — SSE buffer parser (pure)
src/main/ai/groq.ts            — Groq chat/stream/transcribe (fetch)
src/main/ai/openai.ts          — OpenAI chat/stream/vision (fetch)
src/main/ai/intent.ts          — tool schemas + intent extraction
src/main/ai/router.ts          — provider fallback, retry, 30s timeout
src/preload/index.ts           — contextBridge: invoke + on
src/renderer/overlay/index.html, main.tsx, App.tsx, recorder.ts, overlay.css
src/renderer/snip/index.html, main.tsx, Snip.tsx, snip.css
src/renderer/settings/index.html, main.tsx, Settings.tsx, settings.css
tests/*.test.ts                — Vitest unit tests (one file per module)
docs/SMOKE.md                  — manual smoke checklist
```

---

### Task 1: Scaffold project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `vitest.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`
- Create: `src/renderer/overlay/index.html`, `src/renderer/overlay/main.tsx`
- Create: `src/renderer/snip/index.html`, `src/renderer/snip/main.tsx`
- Create: `src/renderer/settings/index.html`, `src/renderer/settings/main.tsx`
- Test: `tests/sanity.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sam",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "dist": "electron-vite build && electron-builder"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```
npm install react react-dom marked
npm install -D electron electron-vite vite typescript @vitejs/plugin-react vitest @types/react @types/react-dom @types/node electron-builder
```
Expected: installs without errors (electron postinstall downloads binary).

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Create `electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          overlay: resolve(__dirname, 'src/renderer/overlay/index.html'),
          snip: resolve(__dirname, 'src/renderer/snip/index.html'),
          settings: resolve(__dirname, 'src/renderer/settings/index.html')
        }
      }
    }
  }
})
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' }
})
```

- [ ] **Step 6: Create minimal main process `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 640,
    height: 600,
    webPreferences: { preload: join(__dirname, '../preload/index.js') }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/src/renderer/overlay/index.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/src/renderer/overlay/index.html'))
  }
})

app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 7: Create `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('sam', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, fn: (...args: unknown[]) => void) => {
    const listener = (_e: unknown, ...args: unknown[]) => fn(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
})
```

- [ ] **Step 8: Create the three renderer entry points**

`src/renderer/overlay/index.html`:
```html
<!DOCTYPE html>
<html>
  <head><meta charset="UTF-8" /><title>Sam Overlay</title></head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

`src/renderer/overlay/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
createRoot(document.getElementById('root')!).render(<div>overlay ok</div>)
```

`src/renderer/snip/index.html` — same as overlay html but title `Sam Snip`.
`src/renderer/snip/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
createRoot(document.getElementById('root')!).render(<div>snip ok</div>)
```

`src/renderer/settings/index.html` — same html but title `Sam Settings`.
`src/renderer/settings/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
createRoot(document.getElementById('root')!).render(<div>settings ok</div>)
```

- [ ] **Step 9: Sanity test `tests/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs', () => expect(1 + 1).toBe(2))
})
```

- [ ] **Step 10: Verify test runner**

Run: `npx vitest run`
Expected: 1 passed.

- [ ] **Step 11: Verify dev launch**

Run: `npm run dev` (kill after verifying)
Expected: window opens showing "overlay ok". If it does, scaffold done.

---

### Task 2: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```ts
export interface SamConfig {
  groqApiKey: string
  openaiApiKey: string
  hotkeys: { toggleOverlay: string; pushToTalk: string; snip: string }
  launchAtStartup: boolean
  micDeviceId: string | null
}

export interface AppEntry {
  name: string
  appId: string
}

export interface Session {
  apps: string[]
  tabs: string[][]
  created: string
  lastUsed: string
}

export type Intent =
  | { type: 'open_app'; name: string }
  | { type: 'open_urls'; urls: string[] }
  | { type: 'open_session'; name: string }
  | { type: 'save_session'; name: string }
  | { type: 'answer' }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Events streamed main -> overlay renderer */
export type AssistantEvent =
  | { kind: 'status'; text: string }
  | { kind: 'token'; text: string }
  | { kind: 'done' }
  | { kind: 'error'; text: string; retryable: boolean }
  | { kind: 'result'; text: string }
  | { kind: 'suggestions'; query: string; apps: AppEntry[] }
  | { kind: 'confirm-save'; name: string; apps: string[]; tabs: string[][]; warning?: string }
  | { kind: 'transcript'; text: string }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 3: Config store

**Files:**
- Create: `src/main/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write failing test `tests/config.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — cannot resolve `../src/main/config`.

- [ ] **Step 3: Implement `src/main/config.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SamConfig } from '../shared/types'

export const DEFAULT_CONFIG: SamConfig = {
  groqApiKey: '',
  openaiApiKey: '',
  hotkeys: { toggleOverlay: 'Alt+Space', pushToTalk: 'Alt+S', snip: 'Alt+Q' },
  launchAtStartup: false,
  micDeviceId: null
}

export class ConfigStore {
  private file: string

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'config.json')
  }

  load(): SamConfig {
    if (!existsSync(this.file)) return { ...DEFAULT_CONFIG }
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'))
      return {
        ...DEFAULT_CONFIG,
        ...raw,
        hotkeys: { ...DEFAULT_CONFIG.hotkeys, ...(raw.hotkeys ?? {}) }
      }
    } catch {
      return { ...DEFAULT_CONFIG }
    }
  }

  save(cfg: SamConfig): void {
    writeFileSync(this.file, JSON.stringify(cfg, null, 2))
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/config.test.ts`
Expected: 3 passed.

---

### Task 4: App index — parse + fuzzy match

**Files:**
- Create: `src/main/appIndex.ts`
- Test: `tests/appIndex.test.ts`

- [ ] **Step 1: Write failing test `tests/appIndex.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/appIndex.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/appIndex.ts`**

```ts
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
  if (qTokens.every((t) => nTokens.some((w) => w.startsWith(t)))) return 50
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
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/appIndex.test.ts`
Expected: 7 passed.

---

### Task 5: App index — PowerShell loader with daily cache

**Files:**
- Modify: `src/main/appIndex.ts` (append)
- Test: `tests/appIndexCache.test.ts`

- [ ] **Step 1: Write failing test `tests/appIndexCache.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/appIndexCache.test.ts`
Expected: FAIL — `loadAppIndex` not exported.

- [ ] **Step 3: Append to `src/main/appIndex.ts`**

```ts
import { execFile } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

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
```

(Imports go at the top of the file alongside the existing import.)

- [ ] **Step 4: Run all appIndex tests**

Run: `npx vitest run tests/appIndex.test.ts tests/appIndexCache.test.ts`
Expected: 11 passed.

---

### Task 6: Launcher

**Files:**
- Create: `src/main/launcher.ts`

No unit test — single spawn call, covered by smoke checklist.

- [ ] **Step 1: Create `src/main/launcher.ts`**

```ts
import { spawn } from 'child_process'

/**
 * Launches any Start Menu app (win32 or UWP) by its AppID via the shell.
 * Works for both .lnk-backed apps and UWP AUMIDs.
 */
export function launchApp(appId: string): void {
  const child = spawn('explorer.exe', [`shell:AppsFolder\\${appId}`], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual spot check (optional but quick)**

Run: `node -e "require('child_process').spawn('explorer.exe',['shell:AppsFolder\\\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'],{detached:true,stdio:'ignore'}).unref()"`
Expected: Windows Calculator opens.

---

### Task 7: Visible-process list

**Files:**
- Create: `src/main/processes.ts`
- Test: `tests/processes.test.ts`

- [ ] **Step 1: Write failing test `tests/processes.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/processes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/processes.ts`**

```ts
import { execFile } from 'child_process'

export interface VisibleProcess {
  name: string
  title: string
}

const NOISE = new Set([
  'explorer', 'textinputhost', 'applicationframehost', 'systemsettings',
  'searchhost', 'startmenuexperiencehost', 'shellexperiencehost', 'sam', 'electron'
])

export function parseVisibleProcesses(json: string): VisibleProcess[] {
  try {
    const data = JSON.parse(json)
    const arr = Array.isArray(data) ? data : [data]
    const seen = new Set<string>()
    const out: VisibleProcess[] = []
    for (const p of arr) {
      if (!p || typeof p.Name !== 'string') continue
      const key = p.Name.toLowerCase()
      if (NOISE.has(key) || seen.has(key)) continue
      seen.add(key)
      out.push({ name: p.Name, title: String(p.MainWindowTitle ?? '') })
    }
    return out
  } catch {
    return []
  }
}

export function listVisibleApps(): Promise<VisibleProcess[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Name, MainWindowTitle | ConvertTo-Json -Compress"
      ],
      { maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve([])
        resolve(parseVisibleProcesses(stdout))
      }
    )
  })
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/processes.test.ts`
Expected: 4 passed.

---

### Task 8: Chrome bridge

**Files:**
- Create: `src/main/chrome.ts`
- Test: `tests/chrome.test.ts`

- [ ] **Step 1: Write failing test `tests/chrome.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/chrome.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/chrome.ts`**

```ts
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
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/chrome.test.ts`
Expected: 2 passed.

---

### Task 9: Session store + capture/open logic

**Files:**
- Create: `src/main/sessions.ts`
- Test: `tests/sessions.test.ts`

- [ ] **Step 1: Write failing test `tests/sessions.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/sessions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/sessions.ts`**

```ts
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { Session } from '../shared/types'
import type { VisibleProcess } from './processes'

export interface SessionDeps {
  listVisibleApps(): Promise<VisibleProcess[]>
  readTabs(): Promise<string[] | null>
  launchApp(name: string): Promise<{ ok: boolean; error?: string }>
  openTabGroup(urls: string[]): boolean
  isRunning(name: string): Promise<boolean>
}

export class SessionStore {
  constructor(private file: string) {}

  private read(): Record<string, Session> {
    if (!existsSync(this.file)) return {}
    try {
      return JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      return {}
    }
  }

  private write(data: Record<string, Session>): void {
    writeFileSync(this.file, JSON.stringify(data, null, 2))
  }

  private findKey(name: string): string | undefined {
    const lower = name.toLowerCase()
    return Object.keys(this.read()).find((k) => k.toLowerCase() === lower)
  }

  list(): string[] {
    return Object.keys(this.read())
  }

  get(name: string): Session | undefined {
    const key = this.findKey(name)
    return key ? this.read()[key] : undefined
  }

  save(name: string, partial: { apps: string[]; tabs: string[][] }): void {
    const data = this.read()
    const key = this.findKey(name) ?? name
    const now = new Date().toISOString()
    data[key] = { ...partial, created: data[key]?.created ?? now, lastUsed: now }
    this.write(data)
  }

  touch(name: string, when = new Date().toISOString()): void {
    const data = this.read()
    const key = this.findKey(name)
    if (!key) return
    data[key].lastUsed = when
    this.write(data)
  }

  delete(name: string): void {
    const data = this.read()
    const key = this.findKey(name)
    if (!key) return
    delete data[key]
    this.write(data)
  }
}

export async function captureSetup(
  deps: SessionDeps
): Promise<{ apps: string[]; tabs: string[][]; warning?: string }> {
  const procs = await deps.listVisibleApps()
  const tabs = await deps.readTabs()
  return {
    apps: procs.map((p) => p.name),
    tabs: tabs && tabs.length > 0 ? [tabs] : [],
    warning: tabs === null
      ? 'Chrome tabs unreadable (Chrome not started with debug port) — saved apps only'
      : undefined
  }
}

export async function openSession(session: Session, deps: SessionDeps): Promise<string[]> {
  const errors: string[] = []
  for (const app of session.apps) {
    if (await deps.isRunning(app)) continue
    const r = await deps.launchApp(app)
    if (!r.ok) errors.push(`${app}: ${r.error ?? 'launch failed'}`)
  }
  for (const group of session.tabs) {
    if (!deps.openTabGroup(group)) errors.push('Chrome not found — tabs not opened')
  }
  return errors
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/sessions.test.ts`
Expected: 8 passed.

---

### Task 10: SSE parser

**Files:**
- Create: `src/main/ai/sse.ts`
- Test: `tests/sse.test.ts`

- [ ] **Step 1: Write failing test `tests/sse.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/sse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/ai/sse.ts`**

```ts
export function parseSseBuffer(buf: string): { events: string[]; rest: string } {
  const normalized = buf.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  const events: string[] = []
  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload && payload !== '[DONE]') events.push(payload)
    }
  }
  return { events, rest }
}

export function extractDelta(eventJson: string): string | null {
  try {
    const j = JSON.parse(eventJson)
    return j?.choices?.[0]?.delta?.content ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/sse.test.ts`
Expected: 5 passed.

---

### Task 11: Groq + OpenAI clients

**Files:**
- Create: `src/main/ai/groq.ts`, `src/main/ai/openai.ts`

These are thin fetch wrappers around external APIs — no unit tests (the SSE parsing and routing logic around them are tested). Verified live in smoke checklist.

- [ ] **Step 1: Create `src/main/ai/groq.ts`**

```ts
import { parseSseBuffer, extractDelta } from './sse'
import type { ChatMessage } from '../../shared/types'

const BASE = 'https://api.groq.com/openai/v1'
const CHAT_MODEL = 'llama-3.3-70b-versatile'
const STT_MODEL = 'whisper-large-v3-turbo'

export interface ToolCall {
  name: string
  arguments: string
}

export interface ChatResult {
  content: string | null
  toolCall: ToolCall | null
}

export class GroqClient {
  readonly name = 'groq'
  constructor(private apiKey: string) {}

  hasKey(): boolean {
    return this.apiKey.length > 0
  }

  async chat(
    messages: ChatMessage[],
    opts: { tools?: unknown[]; signal?: AbortSignal } = {}
  ): Promise<ChatResult> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        ...(opts.tools ? { tools: opts.tools, tool_choice: 'auto' } : {})
      }),
      signal: opts.signal
    })
    if (!res.ok) throw new Error(`groq chat ${res.status}: ${await res.text()}`)
    const j = await res.json()
    const msg = j.choices?.[0]?.message
    const tc = msg?.tool_calls?.[0]?.function
    return {
      content: msg?.content ?? null,
      toolCall: tc ? { name: tc.name, arguments: tc.arguments } : null
    }
  }

  async chatStream(
    messages: ChatMessage[],
    onToken: (t: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CHAT_MODEL, messages, stream: true }),
      signal
    })
    if (!res.ok || !res.body) throw new Error(`groq stream ${res.status}: ${await res.text()}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const { events, rest } = parseSseBuffer(buf)
      buf = rest
      for (const ev of events) {
        const delta = extractDelta(ev)
        if (delta) onToken(delta)
      }
    }
  }

  async transcribe(audio: ArrayBuffer, signal?: AbortSignal): Promise<string> {
    const fd = new FormData()
    fd.append('file', new Blob([audio], { type: 'audio/webm' }), 'audio.webm')
    fd.append('model', STT_MODEL)
    const res = await fetch(`${BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: fd,
      signal
    })
    if (!res.ok) throw new Error(`groq stt ${res.status}: ${await res.text()}`)
    const j = await res.json()
    return (j.text ?? '').trim()
  }
}
```

- [ ] **Step 2: Create `src/main/ai/openai.ts`**

```ts
import { parseSseBuffer, extractDelta } from './sse'
import type { ChatMessage } from '../../shared/types'
import type { ChatResult } from './groq'

const BASE = 'https://api.openai.com/v1'
const MODEL = 'gpt-4o-mini'

export class OpenAIClient {
  readonly name = 'openai'
  constructor(private apiKey: string) {}

  hasKey(): boolean {
    return this.apiKey.length > 0
  }

  async chat(
    messages: ChatMessage[],
    opts: { tools?: unknown[]; signal?: AbortSignal } = {}
  ): Promise<ChatResult> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        ...(opts.tools ? { tools: opts.tools, tool_choice: 'auto' } : {})
      }),
      signal: opts.signal
    })
    if (!res.ok) throw new Error(`openai chat ${res.status}: ${await res.text()}`)
    const j = await res.json()
    const msg = j.choices?.[0]?.message
    const tc = msg?.tool_calls?.[0]?.function
    return {
      content: msg?.content ?? null,
      toolCall: tc ? { name: tc.name, arguments: tc.arguments } : null
    }
  }

  /** Streams an answer about an image (data URL) — the snip Q&A path. */
  async visionStream(
    question: string,
    imageDataUrl: string,
    onToken: (t: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: question },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          }
        ]
      }),
      signal
    })
    if (!res.ok || !res.body) throw new Error(`openai vision ${res.status}: ${await res.text()}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const { events, rest } = parseSseBuffer(buf)
      buf = rest
      for (const ev of events) {
        const delta = extractDelta(ev)
        if (delta) onToken(delta)
      }
    }
  }

  async chatStream(
    messages: ChatMessage[],
    onToken: (t: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, stream: true }),
      signal
    })
    if (!res.ok || !res.body) throw new Error(`openai stream ${res.status}: ${await res.text()}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const { events, rest } = parseSseBuffer(buf)
      buf = rest
      for (const ev of events) {
        const delta = extractDelta(ev)
        if (delta) onToken(delta)
      }
    }
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 12: Intent parsing

**Files:**
- Create: `src/main/ai/intent.ts`
- Test: `tests/intent.test.ts`

- [ ] **Step 1: Write failing test `tests/intent.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { intentFromToolCall, parseIntent, INTENT_TOOLS } from '../src/main/ai/intent'
import type { ChatResult } from '../src/main/ai/groq'

describe('intentFromToolCall', () => {
  it('maps each tool to an intent', () => {
    expect(intentFromToolCall({ name: 'open_app', arguments: '{"name":"spotify"}' }))
      .toEqual({ type: 'open_app', name: 'spotify' })
    expect(intentFromToolCall({ name: 'open_urls', arguments: '{"urls":["https://a.com"]}' }))
      .toEqual({ type: 'open_urls', urls: ['https://a.com'] })
    expect(intentFromToolCall({ name: 'open_session', arguments: '{"name":"leetcode mode"}' }))
      .toEqual({ type: 'open_session', name: 'leetcode mode' })
    expect(intentFromToolCall({ name: 'save_session', arguments: '{"name":"work"}' }))
      .toEqual({ type: 'save_session', name: 'work' })
  })

  it('falls back to answer on unknown tool or malformed args', () => {
    expect(intentFromToolCall({ name: 'nope', arguments: '{}' })).toEqual({ type: 'answer' })
    expect(intentFromToolCall({ name: 'open_app', arguments: 'not json' })).toEqual({ type: 'answer' })
    expect(intentFromToolCall({ name: 'open_app', arguments: '{}' })).toEqual({ type: 'answer' })
  })
})

describe('parseIntent', () => {
  it('returns tool intent when model calls a tool', async () => {
    const chat = async (): Promise<ChatResult> => ({
      content: null,
      toolCall: { name: 'open_app', arguments: '{"name":"spotify"}' }
    })
    expect(await parseIntent('open spotify', [], chat)).toEqual({ type: 'open_app', name: 'spotify' })
  })

  it('returns answer when model replies with plain content', async () => {
    const chat = async (): Promise<ChatResult> => ({ content: 'hello!', toolCall: null })
    expect(await parseIntent('what is rust', [], chat)).toEqual({ type: 'answer' })
  })

  it('sends tools and history to the chat function', async () => {
    let captured: { messages: unknown[]; tools?: unknown[] } | null = null
    const chat = async (messages: unknown[], tools?: unknown[]): Promise<ChatResult> => {
      captured = { messages, tools }
      return { content: 'x', toolCall: null }
    }
    await parseIntent('hi', [{ role: 'user', content: 'earlier' }], chat)
    expect(captured!.tools).toBe(INTENT_TOOLS)
    expect((captured!.messages as { content: string }[]).some((m) => m.content === 'earlier')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/intent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/ai/intent.ts`**

```ts
import type { ChatMessage, Intent } from '../../shared/types'
import type { ChatResult, ToolCall } from './groq'

export const INTENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Launch an application installed on this Windows machine',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'App name as the user said it' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_urls',
      description: 'Open one or more URLs in the browser',
      parameters: {
        type: 'object',
        properties: { urls: { type: 'array', items: { type: 'string' } } },
        required: ['urls']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_session',
      description: 'Open a saved workflow session (a named combo of apps and browser tabs)',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_session',
      description: 'Save the currently open apps and browser tabs as a named session',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  }
]

const SYSTEM_PROMPT = `You are Sam, a Windows desktop assistant.
Decide whether the user's message is a command (use a tool) or a question/chat (no tool).
Commands: opening apps, opening websites/urls, opening or saving named workflow sessions.
"open X mode" or "start X mode" refers to a saved session named "X mode".
If the user asks a question or chats, do NOT call a tool — just answer.`

export type IntentChatFn = (
  messages: ChatMessage[],
  tools?: unknown[]
) => Promise<ChatResult>

export function intentFromToolCall(tc: ToolCall): Intent {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(tc.arguments)
  } catch {
    return { type: 'answer' }
  }
  switch (tc.name) {
    case 'open_app':
      return typeof args.name === 'string' ? { type: 'open_app', name: args.name } : { type: 'answer' }
    case 'open_urls':
      return Array.isArray(args.urls) ? { type: 'open_urls', urls: args.urls.map(String) } : { type: 'answer' }
    case 'open_session':
      return typeof args.name === 'string' ? { type: 'open_session', name: args.name } : { type: 'answer' }
    case 'save_session':
      return typeof args.name === 'string' ? { type: 'save_session', name: args.name } : { type: 'answer' }
    default:
      return { type: 'answer' }
  }
}

export async function parseIntent(
  text: string,
  history: ChatMessage[],
  chat: IntentChatFn
): Promise<Intent> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: text }
  ]
  const result = await chat(messages, INTENT_TOOLS)
  if (result.toolCall) return intentFromToolCall(result.toolCall)
  return { type: 'answer' }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/intent.test.ts`
Expected: 5 passed.

---

### Task 13: AI router (fallback + timeout)

**Files:**
- Create: `src/main/ai/router.ts`
- Test: `tests/router.test.ts`

- [ ] **Step 1: Write failing test `tests/router.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { AIRouter, type Provider } from '../src/main/ai/router'

function provider(name: string, fail = false): Provider {
  return {
    name,
    hasKey: () => true,
    chat: vi.fn(async () => {
      if (fail) throw new Error(`${name} down`)
      return { content: `from ${name}`, toolCall: null }
    }),
    chatStream: vi.fn(async (_m, onToken: (t: string) => void) => {
      if (fail) throw new Error(`${name} down`)
      onToken(`from ${name}`)
    })
  }
}

describe('AIRouter', () => {
  it('uses primary when healthy', async () => {
    const p = provider('groq')
    const router = new AIRouter(p, provider('openai'))
    const r = await router.chat([])
    expect(r.content).toBe('from groq')
    expect(p.chat).toHaveBeenCalledTimes(1)
  })

  it('retries primary once, then falls back', async () => {
    const p = provider('groq', true)
    const f = provider('openai')
    const router = new AIRouter(p, f)
    const r = await router.chat([])
    expect(p.chat).toHaveBeenCalledTimes(2)
    expect(r.content).toBe('from openai')
  })

  it('throws descriptive error when all providers fail', async () => {
    const router = new AIRouter(provider('groq', true), provider('openai', true))
    await expect(router.chat([])).rejects.toThrow(/openai down/)
  })

  it('throws no-key error when no provider has a key', async () => {
    const dead: Provider = { ...provider('groq'), hasKey: () => false }
    const router = new AIRouter(dead, null)
    await expect(router.chat([])).rejects.toThrow(/API key/i)
  })

  it('streams through fallback too', async () => {
    const router = new AIRouter(provider('groq', true), provider('openai'))
    const tokens: string[] = []
    await router.chatStream([], (t) => tokens.push(t))
    expect(tokens).toEqual(['from openai'])
  })

  it('aborts slow calls at timeout', async () => {
    const slow: Provider = {
      name: 'slow',
      hasKey: () => true,
      chat: (_m, opts) =>
        new Promise((_res, rej) => {
          opts?.signal?.addEventListener('abort', () => rej(new Error('aborted')))
        }),
      chatStream: async () => {}
    }
    const router = new AIRouter(slow, null, 50)
    await expect(router.chat([])).rejects.toThrow(/aborted/)
  })
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/router.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/ai/router.ts`**

```ts
import type { ChatMessage } from '../../shared/types'
import type { ChatResult } from './groq'

export interface Provider {
  name: string
  hasKey(): boolean
  chat(messages: ChatMessage[], opts?: { tools?: unknown[]; signal?: AbortSignal }): Promise<ChatResult>
  chatStream(messages: ChatMessage[], onToken: (t: string) => void, signal?: AbortSignal): Promise<void>
}

export class AIRouter {
  constructor(
    private primary: Provider | null,
    private fallback: Provider | null,
    private timeoutMs = 30000
  ) {}

  private providers(): Provider[] {
    return [this.primary, this.fallback].filter(
      (p): p is Provider => p !== null && p.hasKey()
    )
  }

  /** Tries primary twice (1 retry), then fallback once. Each attempt gets a fresh timeout. */
  private async attempt<T>(fn: (p: Provider, signal: AbortSignal) => Promise<T>): Promise<T> {
    const ps = this.providers()
    if (ps.length === 0) throw new Error('No API key configured — open settings to add one')
    let lastErr: unknown
    const plan = ps.length > 1 ? [ps[0], ps[0], ps[1]] : [ps[0], ps[0]]
    for (const p of plan) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
      try {
        return await fn(p, ctrl.signal)
      } catch (e) {
        lastErr = e
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  chat(messages: ChatMessage[], tools?: unknown[]): Promise<ChatResult> {
    return this.attempt((p, signal) => p.chat(messages, { tools, signal }))
  }

  chatStream(messages: ChatMessage[], onToken: (t: string) => void): Promise<void> {
    return this.attempt((p, signal) => p.chatStream(messages, onToken, signal))
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/router.test.ts`
Expected: 6 passed.

---

### Task 14: Chat history

**Files:**
- Create: `src/main/history.ts`
- Test: `tests/history.test.ts`

- [ ] **Step 1: Write failing test `tests/history.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test, verify failure**

Run: `npx vitest run tests/history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/history.ts`**

```ts
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { ChatMessage } from '../shared/types'

export class History {
  private msgs: ChatMessage[] = []

  constructor(private file: string, private cap = 50) {
    if (existsSync(file)) {
      try {
        this.msgs = JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        this.msgs = []
      }
    }
  }

  add(role: 'user' | 'assistant', content: string): void {
    this.msgs.push({ role, content })
    if (this.msgs.length > this.cap) this.msgs = this.msgs.slice(-this.cap)
    writeFileSync(this.file, JSON.stringify(this.msgs))
  }

  recent(n: number): ChatMessage[] {
    return this.msgs.slice(-n)
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run tests/history.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Full test suite check**

Run: `npx vitest run`
Expected: all tests pass (config 3, appIndex 7, cache 4, processes 4, chrome 2, sessions 8, sse 5, intent 5, router 6, history 3, sanity 1 = 48).

---

### Task 15: Screen capture + window factories

**Files:**
- Create: `src/main/capture.ts`, `src/main/windows.ts`

OS glue — no unit tests, verified in smoke checklist.

- [ ] **Step 1: Create `src/main/capture.ts`**

```ts
import { desktopCapturer, screen } from 'electron'

/** Full-resolution screenshot of the primary display as a PNG data URL. */
export async function captureScreen(): Promise<string> {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.size
  const factor = display.scaleFactor
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(width * factor), height: Math.round(height * factor) }
  })
  const primary = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  return primary.thumbnail.toDataURL()
}
```

- [ ] **Step 2: Create `src/main/windows.ts`**

```ts
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

const preload = join(__dirname, '../preload/index.js')

function load(win: BrowserWindow, page: 'overlay' | 'snip' | 'settings'): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/src/renderer/${page}/index.html`)
  } else {
    win.loadFile(join(__dirname, `../renderer/src/renderer/${page}/index.html`))
  }
}

export const OVERLAY_WIDTH = 680
export const OVERLAY_HEIGHT = 600

export function createOverlayWindow(): BrowserWindow {
  const { width } = screen.getPrimaryDisplay().workAreaSize
  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: Math.round((width - OVERLAY_WIDTH) / 2),
    y: 8,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: { preload }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Idle pill = click-through; toggled interactive via IPC when expanded
  win.setIgnoreMouseEvents(true, { forward: true })
  load(win, 'overlay')
  return win
}

export function createSnipWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().bounds
  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreen: true,
    webPreferences: { preload }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  load(win, 'snip')
  return win
}

export function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 760,
    height: 640,
    title: 'Sam Settings',
    webPreferences: { preload }
  })
  load(win, 'settings')
  return win
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 16: Hotkeys

**Files:**
- Create: `src/main/hotkeys.ts`

- [ ] **Step 1: Create `src/main/hotkeys.ts`**

```ts
import { globalShortcut } from 'electron'

export interface HotkeyHandlers {
  toggleOverlay: () => void
  pushToTalk: () => void
  snip: () => void
}

/**
 * Registers all hotkeys. Returns accelerator strings that failed
 * (already taken by another app) so settings can flag them.
 */
export function registerHotkeys(
  bindings: { toggleOverlay: string; pushToTalk: string; snip: string },
  handlers: HotkeyHandlers
): string[] {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  const entries: [string, () => void][] = [
    [bindings.toggleOverlay, handlers.toggleOverlay],
    [bindings.pushToTalk, handlers.pushToTalk],
    [bindings.snip, handlers.snip]
  ]
  for (const [accel, handler] of entries) {
    try {
      if (!globalShortcut.register(accel, handler)) failed.push(accel)
    } catch {
      failed.push(accel)
    }
  }
  return failed
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

---

### Task 17: IPC + assistant pipeline (main wiring)

**Files:**
- Create: `src/main/ipc.ts`
- Modify: `src/main/index.ts` (full rewrite)

This is the integration hub. Logic it composes is already unit-tested; the wiring itself is smoke-tested.

- [ ] **Step 1: Create `src/main/ipc.ts`**

```ts
import { ipcMain, BrowserWindow, app } from 'electron'
import { join } from 'path'
import type { AssistantEvent, SamConfig, Intent } from '../shared/types'
import { ConfigStore } from './config'
import { loadAppIndex, findApp } from './appIndex'
import { launchApp } from './launcher'
import { listVisibleApps } from './processes'
import { readOpenTabs, openTabGroup } from './chrome'
import { SessionStore, captureSetup, openSession, type SessionDeps } from './sessions'
import { History } from './history'
import { captureScreen } from './capture'
import { GroqClient } from './ai/groq'
import { OpenAIClient } from './ai/openai'
import { AIRouter } from './ai/router'
import { parseIntent, INTENT_TOOLS } from './ai/intent'

export interface IpcContext {
  overlay: BrowserWindow
  getSnipWindow: () => BrowserWindow | null
  openSnip: () => Promise<void>
  closeSnip: () => void
  openSettings: () => void
  reregisterHotkeys: () => string[]
}

export function setupIpc(ctx: IpcContext): { config: ConfigStore } {
  const dataDir = app.getPath('userData')
  const config = new ConfigStore(dataDir)
  const sessions = new SessionStore(join(dataDir, 'sessions.json'))
  const history = new History(join(dataDir, 'history.json'))

  let groq = new GroqClient(config.load().groqApiKey)
  let openai = new OpenAIClient(config.load().openaiApiKey)
  let router = new AIRouter(groq, openai)
  // Snip image attached to the conversation until cleared
  let attachedImage: string | null = null

  function rebuildClients(): void {
    const cfg = config.load()
    groq = new GroqClient(cfg.groqApiKey)
    openai = new OpenAIClient(cfg.openaiApiKey)
    router = new AIRouter(groq, openai)
  }

  function emit(ev: AssistantEvent): void {
    ctx.overlay.webContents.send('assistant:event', ev)
  }

  const sessionDeps: SessionDeps = {
    listVisibleApps,
    readTabs: () => readOpenTabs(),
    launchApp: async (name) => {
      const apps = await loadAppIndex(dataDir)
      const { match } = findApp(name, apps)
      if (!match) return { ok: false, error: 'no matching app' }
      launchApp(match.appId)
      return { ok: true }
    },
    openTabGroup: (urls) => openTabGroup(urls),
    isRunning: async (name) => {
      const procs = await listVisibleApps()
      return procs.some((p) => p.name.toLowerCase() === name.toLowerCase())
    }
  }

  async function executeIntent(intent: Intent, originalText: string): Promise<void> {
    switch (intent.type) {
      case 'open_app': {
        const apps = await loadAppIndex(dataDir)
        const { match, suggestions } = findApp(intent.name, apps)
        if (match) {
          launchApp(match.appId)
          emit({ kind: 'result', text: `Opening **${match.name}**` })
        } else {
          emit({ kind: 'suggestions', query: intent.name, apps: suggestions })
        }
        break
      }
      case 'open_urls': {
        const ok = openTabGroup(intent.urls)
        emit(ok
          ? { kind: 'result', text: `Opening ${intent.urls.length} tab(s)` }
          : { kind: 'error', text: 'Chrome not found', retryable: false })
        break
      }
      case 'open_session': {
        const session = sessions.get(intent.name)
        if (!session) {
          const names = sessions.list()
          emit({
            kind: 'error',
            text: `No session "${intent.name}".${names.length ? ` Saved: ${names.join(', ')}` : ' None saved yet.'}`,
            retryable: false
          })
          break
        }
        emit({ kind: 'status', text: `Opening session "${intent.name}"…` })
        const errors = await openSession(session, sessionDeps)
        sessions.touch(intent.name)
        emit(errors.length === 0
          ? { kind: 'result', text: `Session **${intent.name}** opened` }
          : { kind: 'result', text: `Session opened with issues:\n${errors.join('\n')}` })
        break
      }
      case 'save_session': {
        emit({ kind: 'status', text: 'Capturing current setup…' })
        const setup = await captureSetup(sessionDeps)
        emit({ kind: 'confirm-save', name: intent.name, apps: setup.apps, tabs: setup.tabs, warning: setup.warning })
        break
      }
      case 'answer': {
        const messages = [
          { role: 'system' as const, content: 'You are Sam, a concise helpful desktop assistant.' },
          ...history.recent(6),
          { role: 'user' as const, content: originalText }
        ]
        let answer = ''
        await router.chatStream(messages, (t) => {
          answer += t
          emit({ kind: 'token', text: t })
        })
        history.add('assistant', answer)
        break
      }
    }
  }

  ipcMain.handle('submit', async (_e, text: string) => {
    try {
      history.add('user', text)
      if (attachedImage) {
        if (!openai.hasKey()) {
          emit({ kind: 'error', text: 'OpenAI key needed for screen questions — open settings', retryable: false })
          return
        }
        let answer = ''
        await openai.visionStream(text, attachedImage, (t) => {
          answer += t
          emit({ kind: 'token', text: t })
        })
        history.add('assistant', answer)
        emit({ kind: 'done' })
        return
      }
      const intent = await parseIntent(text, history.recent(6), (m, tools) =>
        router.chat(m, tools ?? INTENT_TOOLS)
      )
      await executeIntent(intent, text)
      emit({ kind: 'done' })
    } catch (e) {
      emit({ kind: 'error', text: e instanceof Error ? e.message : String(e), retryable: true })
    }
  })

  ipcMain.handle('voice:transcribe', async (_e, audio: ArrayBuffer) => {
    if (!groq.hasKey()) throw new Error('Groq key needed for voice — open settings')
    return groq.transcribe(audio)
  })

  ipcMain.handle('session:confirm-save', (_e, payload: { name: string; apps: string[]; tabs: string[][] }) => {
    sessions.save(payload.name, { apps: payload.apps, tabs: payload.tabs })
    emit({ kind: 'result', text: `Session **${payload.name}** saved` })
  })

  ipcMain.handle('sessions:list', () => {
    const out: Record<string, unknown> = {}
    for (const name of sessions.list()) out[name] = sessions.get(name)
    return out
  })
  ipcMain.handle('sessions:save', (_e, name: string, data: { apps: string[]; tabs: string[][] }) =>
    sessions.save(name, data))
  ipcMain.handle('sessions:delete', (_e, name: string) => sessions.delete(name))

  ipcMain.handle('config:get', () => config.load())
  ipcMain.handle('config:set', (_e, cfg: SamConfig) => {
    config.save(cfg)
    rebuildClients()
    app.setLoginItemSettings({ openAtLogin: cfg.launchAtStartup })
    return ctx.reregisterHotkeys()
  })

  ipcMain.handle('overlay:set-interactive', (_e, interactive: boolean) => {
    ctx.overlay.setIgnoreMouseEvents(!interactive, { forward: true })
    if (interactive) ctx.overlay.focus()
  })

  ipcMain.handle('image:clear', () => { attachedImage = null })

  ipcMain.handle('snip:start', () => ctx.openSnip())
  ipcMain.handle('snip:done', (_e, dataUrl: string) => {
    attachedImage = dataUrl
    ctx.closeSnip()
    ctx.overlay.webContents.send('assistant:event', { kind: 'status', text: 'snip-attached' })
    ctx.overlay.webContents.send('snip:attached', dataUrl)
  })
  ipcMain.handle('snip:cancel', () => ctx.closeSnip())
  ipcMain.handle('snip:capture-screen', () => captureScreen())

  ipcMain.handle('settings:open', () => ctx.openSettings())

  return { config }
}
```

- [ ] **Step 2: Rewrite `src/main/index.ts`**

```ts
import { app, BrowserWindow, session, globalShortcut } from 'electron'
import { createOverlayWindow, createSnipWindow, createSettingsWindow } from './windows'
import { registerHotkeys } from './hotkeys'
import { setupIpc } from './ipc'
import { captureScreen } from './capture'

let overlay: BrowserWindow | null = null
let snip: BrowserWindow | null = null
let settings: BrowserWindow | null = null

app.whenReady().then(() => {
  // Auto-grant mic access for our own renderer
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media')
  })

  overlay = createOverlayWindow()

  const openSnip = async (): Promise<void> => {
    if (snip) return
    const screenshot = await captureScreen()
    snip = createSnipWindow()
    snip.webContents.once('did-finish-load', () => {
      snip?.webContents.send('snip:show', screenshot)
    })
    snip.on('closed', () => { snip = null })
  }

  const closeSnip = (): void => {
    snip?.close()
    snip = null
  }

  const openSettings = (): void => {
    if (settings) { settings.focus(); return }
    settings = createSettingsWindow()
    settings.on('closed', () => { settings = null })
  }

  const { config } = setupIpc({
    overlay,
    getSnipWindow: () => snip,
    openSnip,
    closeSnip,
    openSettings,
    reregisterHotkeys: () => doRegister()
  })

  function doRegister(): string[] {
    return registerHotkeys(config.load().hotkeys, {
      toggleOverlay: () => overlay?.webContents.send('hotkey', 'toggleOverlay'),
      pushToTalk: () => overlay?.webContents.send('hotkey', 'pushToTalk'),
      snip: () => void openSnip()
    })
  }

  const failed = doRegister()
  if (failed.length > 0) {
    overlay.webContents.once('did-finish-load', () => {
      overlay?.webContents.send('assistant:event', {
        kind: 'error',
        text: `Hotkey(s) in use by another app: ${failed.join(', ')} — rebind in settings`,
        retryable: false
      })
    })
  }
})

app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => globalShortcut.unregisterAll())
```

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests still pass.

- [ ] **Step 4: Manual verify**

Run: `npm run dev`
Expected: transparent window appears top-center (content still placeholder "overlay ok"). No crash in terminal. Kill it.

---

### Task 18: Overlay UI

**Files:**
- Create: `src/renderer/overlay/App.tsx`, `src/renderer/overlay/overlay.css`, `src/renderer/overlay/sam.d.ts`
- Modify: `src/renderer/overlay/main.tsx`

- [ ] **Step 1: Create `src/renderer/overlay/sam.d.ts`** (shared ambient type for the preload bridge — snip and settings copy this pattern)

```ts
export {}

declare global {
  interface Window {
    sam: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, fn: (...args: unknown[]) => void) => () => void
    }
  }
}
```

- [ ] **Step 2: Create `src/renderer/overlay/overlay.css`**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: transparent; overflow: hidden; font-family: 'Segoe UI', system-ui, sans-serif; }

.wrap { display: flex; flex-direction: column; align-items: center; padding-top: 4px; }

.pill {
  display: flex; align-items: center; gap: 8px;
  background: rgba(20, 22, 30, 0.78);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 6px 16px;
  color: #e8eaf0; font-size: 13px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; }
.dot.listening { background: #f87171; animation: pulse 1s infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }

.panel {
  width: 640px;
  background: rgba(20, 22, 30, 0.85);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  padding: 10px 14px;
  color: #e8eaf0;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
}
.inputRow { display: flex; align-items: center; gap: 8px; }
.inputRow input {
  flex: 1; background: transparent; border: none; outline: none;
  color: #e8eaf0; font-size: 14px; padding: 6px 2px;
}
.inputRow input::placeholder { color: rgba(232, 234, 240, 0.4); }
.micBtn, .clearBtn {
  background: rgba(255, 255, 255, 0.08); border: none; border-radius: 8px;
  color: #e8eaf0; padding: 5px 9px; cursor: pointer; font-size: 12px;
}
.micBtn.rec { background: rgba(248, 113, 113, 0.35); }

.thumb { max-height: 56px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); }
.attachRow { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }

.response {
  margin-top: 8px; padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13px; line-height: 1.55;
  max-height: 38vh; overflow-y: auto;
  word-break: break-word;
}
.response :is(p, ul, ol, pre) { margin-bottom: 8px; }
.response pre { background: rgba(0,0,0,0.4); padding: 8px; border-radius: 8px; overflow-x: auto; }
.response code { font-family: Consolas, monospace; font-size: 12px; }

.status { font-size: 11px; opacity: 0.55; margin-top: 6px; }
.error { color: #fca5a5; }
.sugBtn {
  display: inline-block; margin: 4px 6px 0 0; padding: 4px 10px;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15);
  border-radius: 8px; color: #e8eaf0; cursor: pointer; font-size: 12px;
}
.confirmBox { margin-top: 8px; font-size: 12px; }
.confirmBox ul { margin: 4px 0 8px 16px; }
```

- [ ] **Step 3: Create `src/renderer/overlay/App.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { Recorder } from './recorder'
import './overlay.css'

type Mode = 'idle' | 'expanded'

interface SaveConfirm {
  name: string
  apps: string[]
  tabs: string[][]
  warning?: string
}

interface Suggestion {
  name: string
  appId: string
}

export default function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('idle')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [attached, setAttached] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<SaveConfirm | null>(null)
  const [suggestions, setSuggestions] = useState<{ query: string; apps: Suggestion[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recorder = useRef(new Recorder())

  const setInteractive = useCallback((on: boolean) => {
    void window.sam.invoke('overlay:set-interactive', on)
  }, [])

  const expand = useCallback(() => {
    setMode('expanded')
    setInteractive(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [setInteractive])

  const collapse = useCallback(() => {
    setMode('idle')
    setInteractive(false)
    setError('')
    setSuggestions(null)
    setConfirm(null)
  }, [setInteractive])

  const submit = useCallback(async (text: string) => {
    if (!text.trim() || busy) return
    setBusy(true)
    setResponse('')
    setError('')
    setStatus('')
    setSuggestions(null)
    setInput('')
    await window.sam.invoke('submit', text.trim())
    setBusy(false)
  }, [busy])

  const toggleVoice = useCallback(async () => {
    if (listening) {
      setListening(false)
      setStatus('Transcribing…')
      try {
        const audio = await recorder.current.stop()
        const text = (await window.sam.invoke('voice:transcribe', audio)) as string
        setStatus('')
        if (text) {
          setInput(text)
          await submit(text)
        }
      } catch (e) {
        setStatus('')
        setError(e instanceof Error ? e.message : String(e))
      }
    } else {
      try {
        await recorder.current.start()
        setListening(true)
        setStatus('Listening… (Alt+S to stop)')
      } catch {
        setError('Microphone unavailable — check Windows mic permissions. Typing still works.')
      }
    }
  }, [listening, submit])

  useEffect(() => {
    const offHotkey = window.sam.on('hotkey', (...args: unknown[]) => {
      const name = args[0] as string
      if (name === 'toggleOverlay') {
        setMode((m) => {
          if (m === 'idle') { expand(); return 'expanded' }
          collapse(); return 'idle'
        })
      }
      if (name === 'pushToTalk') {
        expand()
        void toggleVoice()
      }
    })

    const offEvent = window.sam.on('assistant:event', (...args: unknown[]) => {
      const ev = args[0] as { kind: string; [k: string]: unknown }
      switch (ev.kind) {
        case 'token': setResponse((r) => r + (ev.text as string)); break
        case 'status': if (ev.text !== 'snip-attached') setStatus(ev.text as string); break
        case 'result': setResponse(ev.text as string); setStatus(''); break
        case 'error': setError(ev.text as string); setStatus(''); break
        case 'done': setStatus(''); break
        case 'suggestions':
          setSuggestions({ query: ev.query as string, apps: ev.apps as Suggestion[] })
          break
        case 'confirm-save':
          setConfirm(ev as unknown as SaveConfirm)
          break
      }
    })

    const offSnip = window.sam.on('snip:attached', (...args: unknown[]) => {
      setAttached(args[0] as string)
      expand()
    })

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') collapse()
    }
    window.addEventListener('keydown', onKey)
    return () => { offHotkey(); offEvent(); offSnip(); window.removeEventListener('keydown', onKey) }
  }, [expand, collapse, toggleVoice])

  if (mode === 'idle') {
    return (
      <div className="wrap">
        <div className="pill" onClick={expand}>
          <span className={`dot${listening ? ' listening' : ''}`} />
          <span>Sam</span>
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <div className="panel">
        {attached && (
          <div className="attachRow">
            <img className="thumb" src={attached} alt="snip" />
            <button className="clearBtn" onClick={() => { setAttached(null); void window.sam.invoke('image:clear') }}>
              ✕ clear
            </button>
          </div>
        )}
        <div className="inputRow">
          <span className={`dot${listening ? ' listening' : ''}`} />
          <input
            ref={inputRef}
            value={input}
            placeholder={attached ? 'Ask about the snip…' : 'Ask anything, or "open spotify"…'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(input) }}
          />
          <button className={`micBtn${listening ? ' rec' : ''}`} onClick={() => void toggleVoice()}>
            {listening ? '■' : '🎤'}
          </button>
          <button className="clearBtn" onClick={() => void window.sam.invoke('settings:open')}>⚙</button>
        </div>

        {response && (
          <div className="response" dangerouslySetInnerHTML={{ __html: marked.parse(response) as string }} />
        )}

        {suggestions && (
          <div className="confirmBox">
            No app matched "{suggestions.query}". Did you mean:
            <div>
              {suggestions.apps.map((a) => (
                <button key={a.appId} className="sugBtn" onClick={() => void submit(`open ${a.name}`)}>
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {confirm && (
          <div className="confirmBox">
            Save session <b>{confirm.name}</b>?
            {confirm.warning && <div className="error">{confirm.warning}</div>}
            <ul>
              {confirm.apps.map((a) => <li key={a}>app: {a}</li>)}
              {confirm.tabs.flat().map((t) => <li key={t}>tab: {t}</li>)}
            </ul>
            <button
              className="sugBtn"
              onClick={() => {
                void window.sam.invoke('session:confirm-save', {
                  name: confirm.name, apps: confirm.apps, tabs: confirm.tabs
                })
                setConfirm(null)
              }}
            >
              Save
            </button>
            <button className="sugBtn" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        )}

        {status && <div className="status">{status}</div>}
        {error && <div className="status error">{error}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update `src/renderer/overlay/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 5: Create `src/renderer/overlay/recorder.ts`**

```ts
export class Recorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null

  async start(deviceId?: string | null): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true
    })
    this.chunks = []
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' })
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data) }
    this.mediaRecorder.start()
  }

  stop(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const mr = this.mediaRecorder
      if (!mr) return reject(new Error('not recording'))
      mr.onstop = async () => {
        this.stream?.getTracks().forEach((t) => t.stop())
        this.stream = null
        this.mediaRecorder = null
        resolve(await new Blob(this.chunks, { type: 'audio/webm' }).arrayBuffer())
      }
      mr.stop()
    })
  }
}
```

- [ ] **Step 6: Typecheck + manual verify**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npm run dev`. Verify:
- Pill appears top-center over other apps.
- Click-through works when idle (clicks land on apps underneath everywhere except the pill — note: whole window is click-through when idle, pill click works because `Alt+Space` is primary; clicking the pill requires the forward option which keeps hover events — if pill click doesn't register, use Alt+Space only and remove `onClick`).
- `Alt+Space` expands → input focused; typing works; Esc collapses.
- With a Groq key in `%APPDATA%/sam/config.json`, typing "hi" streams a reply; "open calculator" opens Calculator.

---

### Task 19: Snip window UI

**Files:**
- Create: `src/renderer/snip/Snip.tsx`, `src/renderer/snip/snip.css`, `src/renderer/snip/sam.d.ts` (same content as overlay's `sam.d.ts`)
- Modify: `src/renderer/snip/main.tsx`

- [ ] **Step 1: Create `src/renderer/snip/snip.css`**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }
body { overflow: hidden; cursor: crosshair; user-select: none; }
.shot { position: fixed; inset: 0; width: 100vw; height: 100vh; }
.dim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); }
.rect {
  position: fixed; border: 1.5px solid #60a5fa;
  background: rgba(96, 165, 250, 0.15);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
}
.hint {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  background: rgba(20,22,30,0.85); color: #e8eaf0; padding: 6px 14px;
  border-radius: 999px; font: 13px 'Segoe UI', sans-serif;
}
```

- [ ] **Step 2: Create `src/renderer/snip/Snip.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import './snip.css'

interface Rect { x: number; y: number; w: number; h: number }

export default function Snip(): JSX.Element {
  const [shot, setShot] = useState<string | null>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const off = window.sam.on('snip:show', (...args: unknown[]) => setShot(args[0] as string))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void window.sam.invoke('snip:cancel')
    }
    window.addEventListener('keydown', onKey)
    return () => { off(); window.removeEventListener('keydown', onKey) }
  }, [])

  function crop(r: Rect): void {
    const img = imgRef.current
    if (!img || r.w < 5 || r.h < 5) return
    // screenshot is full physical resolution; viewport is logical pixels
    const scaleX = img.naturalWidth / window.innerWidth
    const scaleY = img.naturalHeight / window.innerHeight
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(r.w * scaleX)
    canvas.height = Math.round(r.h * scaleY)
    const c = canvas.getContext('2d')!
    c.drawImage(
      img,
      Math.round(r.x * scaleX), Math.round(r.y * scaleY),
      canvas.width, canvas.height,
      0, 0, canvas.width, canvas.height
    )
    void window.sam.invoke('snip:done', canvas.toDataURL('image/png'))
  }

  if (!shot) return <div className="dim" />

  return (
    <div
      onMouseDown={(e) => { setStart({ x: e.clientX, y: e.clientY }); setRect(null) }}
      onMouseMove={(e) => {
        if (!start) return
        setRect({
          x: Math.min(start.x, e.clientX),
          y: Math.min(start.y, e.clientY),
          w: Math.abs(e.clientX - start.x),
          h: Math.abs(e.clientY - start.y)
        })
      }}
      onMouseUp={() => {
        if (rect) crop(rect)
        else void window.sam.invoke('snip:cancel')
        setStart(null)
      }}
    >
      <img ref={imgRef} className="shot" src={shot} alt="" draggable={false} />
      {!rect && <div className="dim" />}
      {rect && (
        <div className="rect" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
      )}
      <div className="hint">Drag to select a region — Esc to cancel</div>
    </div>
  )
}
```

- [ ] **Step 3: Update `src/renderer/snip/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client'
import Snip from './Snip'

createRoot(document.getElementById('root')!).render(<Snip />)
```

- [ ] **Step 4: Typecheck + manual verify**

Run: `npx tsc --noEmit` — no errors.
Run: `npm run dev`. Press `Alt+Q`:
- Fullscreen frozen screenshot appears with dim + hint.
- Drag selects a region with blue rectangle; release → snip window closes, overlay expands with thumbnail.
- With OpenAI key configured, ask "what does this say" → streamed vision answer.
- Esc cancels.

---

### Task 20: Settings window

**Files:**
- Create: `src/renderer/settings/Settings.tsx`, `src/renderer/settings/settings.css`, `src/renderer/settings/sam.d.ts` (same content as overlay's `sam.d.ts`)
- Modify: `src/renderer/settings/main.tsx`

- [ ] **Step 1: Create `src/renderer/settings/settings.css`**

```css
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #16181f; color: #e8eaf0; margin: 0; }
.page { padding: 20px 28px; max-width: 700px; }
h2 { font-size: 16px; margin: 18px 0 8px; }
label { display: block; font-size: 12px; opacity: 0.7; margin: 10px 0 4px; }
input, select {
  width: 100%; padding: 7px 10px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06);
  color: #e8eaf0; font-size: 13px;
}
.row { display: flex; gap: 12px; }
.row > div { flex: 1; }
button {
  margin-top: 14px; padding: 8px 18px; border-radius: 8px; border: none;
  background: #3b82f6; color: white; font-size: 13px; cursor: pointer;
}
button.danger { background: rgba(248,113,113,0.25); color: #fca5a5; margin-left: 8px; }
.note { font-size: 11px; opacity: 0.5; margin-top: 4px; }
.err { color: #fca5a5; font-size: 12px; margin-top: 8px; }
.ok { color: #4ade80; font-size: 12px; margin-top: 8px; }
.sessionRow { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px; }
.sessionRow span { flex: 1; }
textarea {
  width: 100%; min-height: 80px; padding: 7px 10px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06);
  color: #e8eaf0; font-size: 12px; font-family: Consolas, monospace;
}
.check { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; }
.check input { width: auto; }
```

- [ ] **Step 2: Create `src/renderer/settings/Settings.tsx`**

```tsx
import { useEffect, useState } from 'react'
import './settings.css'

interface Cfg {
  groqApiKey: string
  openaiApiKey: string
  hotkeys: { toggleOverlay: string; pushToTalk: string; snip: string }
  launchAtStartup: boolean
  micDeviceId: string | null
}

interface SessionData { apps: string[]; tabs: string[][] }

export default function Settings(): JSX.Element {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [mics, setMics] = useState<{ id: string; label: string }[]>([])
  const [sessions, setSessions] = useState<Record<string, SessionData>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [msg, setMsg] = useState('')
  const [failedKeys, setFailedKeys] = useState<string[]>([])

  useEffect(() => {
    void window.sam.invoke('config:get').then((c) => setCfg(c as Cfg))
    void window.sam.invoke('sessions:list').then((s) => setSessions(s as Record<string, SessionData>))
    void navigator.mediaDevices.enumerateDevices().then((devs) =>
      setMics(devs.filter((d) => d.kind === 'audioinput').map((d) => ({ id: d.deviceId, label: d.label || d.deviceId })))
    )
  }, [])

  if (!cfg) return <div className="page">Loading…</div>

  async function save(): Promise<void> {
    const failed = (await window.sam.invoke('config:set', cfg)) as string[]
    setFailedKeys(failed)
    setMsg(failed.length ? '' : 'Saved')
    setTimeout(() => setMsg(''), 2000)
  }

  function startEdit(name: string): void {
    setEditing(name)
    setEditText(JSON.stringify(sessions[name], null, 2))
  }

  async function saveEdit(): Promise<void> {
    if (!editing) return
    try {
      const data = JSON.parse(editText) as SessionData
      await window.sam.invoke('sessions:save', editing, data)
      setSessions({ ...sessions, [editing]: data })
      setEditing(null)
    } catch {
      setMsg('Invalid JSON')
    }
  }

  async function del(name: string): Promise<void> {
    await window.sam.invoke('sessions:delete', name)
    const next = { ...sessions }
    delete next[name]
    setSessions(next)
  }

  return (
    <div className="page">
      <h2>API Keys</h2>
      <label>Groq API key (voice + commands + chat — free tier)</label>
      <input type="password" value={cfg.groqApiKey} onChange={(e) => setCfg({ ...cfg, groqApiKey: e.target.value })} />
      <label>OpenAI API key (screen snip questions)</label>
      <input type="password" value={cfg.openaiApiKey} onChange={(e) => setCfg({ ...cfg, openaiApiKey: e.target.value })} />

      <h2>Hotkeys</h2>
      <p className="note">Electron accelerator format, e.g. Alt+Space, Ctrl+Shift+K</p>
      <div className="row">
        <div>
          <label>Toggle overlay</label>
          <input value={cfg.hotkeys.toggleOverlay} onChange={(e) => setCfg({ ...cfg, hotkeys: { ...cfg.hotkeys, toggleOverlay: e.target.value } })} />
        </div>
        <div>
          <label>Push-to-talk</label>
          <input value={cfg.hotkeys.pushToTalk} onChange={(e) => setCfg({ ...cfg, hotkeys: { ...cfg.hotkeys, pushToTalk: e.target.value } })} />
        </div>
        <div>
          <label>Snip</label>
          <input value={cfg.hotkeys.snip} onChange={(e) => setCfg({ ...cfg, hotkeys: { ...cfg.hotkeys, snip: e.target.value } })} />
        </div>
      </div>
      {failedKeys.length > 0 && <div className="err">In use by another app: {failedKeys.join(', ')} — pick different bindings</div>}

      <h2>General</h2>
      <label>Microphone</label>
      <select value={cfg.micDeviceId ?? ''} onChange={(e) => setCfg({ ...cfg, micDeviceId: e.target.value || null })}>
        <option value="">System default</option>
        {mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      <div className="check">
        <input
          type="checkbox"
          checked={cfg.launchAtStartup}
          onChange={(e) => setCfg({ ...cfg, launchAtStartup: e.target.checked })}
        />
        Launch Sam when Windows starts
      </div>

      <button onClick={() => void save()}>Save</button>
      {msg && <div className={msg === 'Saved' ? 'ok' : 'err'}>{msg}</div>}

      <h2>Sessions</h2>
      {Object.keys(sessions).length === 0 && <p className="note">None saved. Say "save this as work mode".</p>}
      {Object.entries(sessions).map(([name, s]) => (
        <div className="sessionRow" key={name}>
          <span>{name} — {s.apps.length} apps, {s.tabs.flat().length} tabs</span>
          <button onClick={() => startEdit(name)}>Edit</button>
          <button className="danger" onClick={() => void del(name)}>Delete</button>
        </div>
      ))}
      {editing && (
        <div>
          <label>Editing "{editing}" (JSON: apps + tabs)</label>
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
          <button onClick={() => void saveEdit()}>Save session</button>
          <button className="danger" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update `src/renderer/settings/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client'
import Settings from './Settings'

createRoot(document.getElementById('root')!).render(<Settings />)
```

- [ ] **Step 4: Typecheck + manual verify**

Run: `npx tsc --noEmit` — no errors.
Run: `npm run dev`. Click ⚙ in expanded overlay:
- Settings window opens; keys/hotkeys/mic/startup fields present and persist after Save + restart.
- Saving a bad hotkey (e.g. one registered by another running app) shows red conflict text.
- Sessions list shows saved sessions; edit + delete work.

---

### Task 21: Packaging + smoke checklist

**Files:**
- Modify: `package.json` (electron-builder config)
- Create: `docs/SMOKE.md`

- [ ] **Step 1: Add electron-builder config to `package.json`**

Add this top-level key:

```json
"build": {
  "appId": "dev.karthik.sam",
  "productName": "Sam",
  "win": { "target": "nsis" },
  "nsis": { "oneClick": true, "perMachine": false },
  "files": ["out/**"]
}
```

- [ ] **Step 2: Create `docs/SMOKE.md`**

```markdown
# Sam — Manual Smoke Checklist

Run after any change to OS glue (hotkeys, windows, capture, mic). `npm run dev` or installed build.

## Overlay
- [ ] Pill appears top-center, above all windows (test over a fullscreen video)
- [ ] When idle, clicks pass through to apps underneath
- [ ] Alt+Space expands; input is focused; Esc collapses
- [ ] Streams a chat answer for "explain closures in js" (markdown rendered)

## Voice
- [ ] Alt+S starts recording (red pulsing dot), Alt+S again stops
- [ ] Spoken "open calculator" → transcript appears → Calculator launches
- [ ] Unplugging/denying mic shows error toast; typing still works

## Commands
- [ ] "open spotify" launches Spotify
- [ ] "open spotty" (typo) shows 3 suggestions; clicking one launches it
- [ ] "open leetcode.com and neetcode.io" opens both in one Chrome window

## Sessions
- [ ] With Chrome opened BY SAM: "save this as test mode" lists apps + tabs, Save persists
- [ ] With Chrome opened manually (no debug port): save warns "apps only"
- [ ] "open test mode" launches missing apps + tabs; already-running apps not duplicated
- [ ] Settings window lists/edits/deletes sessions

## Snip
- [ ] Alt+Q freezes screen; drag selects; thumbnail lands in overlay
- [ ] Question about snip gets a correct vision answer
- [ ] Esc cancels snip cleanly (overlay still works after)
- [ ] Follow-up question still references the attached snip; ✕ clear detaches it

## Errors
- [ ] Blank Groq key: any command shows "open settings" prompt
- [ ] Bad Groq key + valid OpenAI key: chat still answers (fallback)
- [ ] Hotkey conflict shows red warning in settings

## Packaging
- [ ] `npm run dist` produces installer in `dist/`; installed app passes Overlay + Commands sections
- [ ] "Launch at startup" checkbox survives reboot
```

- [ ] **Step 3: Build installer**

Run: `npm run dist`
Expected: `dist/Sam Setup 0.1.0.exe` created without errors.

- [ ] **Step 4: Run the full smoke checklist**

Walk `docs/SMOKE.md` top to bottom against the installed build. Fix anything that fails before calling the project done.

---

## Self-review notes

- **Spec coverage:** overlay states (T18), voice (T18 recorder + T17 transcribe), snip+vision (T15/T19/T11), app launching + fuzzy + suggestions (T4/T5/T6/T17), sessions incl. capture-confirm flow (T9/T17/T18/T20), Chrome bridge + degradation (T8/T9), intent parsing w/ history (T12/T14), fallback/retry/timeout (T13), hotkey conflicts (T16/T20), settings + startup + mic picker (T20), packaging + smoke (T21). Error handling spec items all mapped: no-key (T17 submit/voice guards + router no-key error), Groq down → retry → fallback (T13), mic denied (T18 toggleVoice catch), app match fail (T17 suggestions), tabs unreadable (T9 warning), hotkey conflict (T16 + T20), 30s timeout + cancel (T13; Esc collapse hides stream).
- **Known deviation:** tap-to-toggle PTT only (documented in header).
- **Type consistency check done:** `AssistantEvent` kinds match between `ipc.ts` emits and `App.tsx` handler; `SessionDeps` shape matches between `sessions.ts`, tests, and `ipc.ts`; `ChatResult`/`Provider` shared via `groq.ts`/`router.ts` imports.
