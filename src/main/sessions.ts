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
