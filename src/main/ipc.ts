import { ipcMain, BrowserWindow, app } from 'electron'
import { join } from 'path'
import type { AssistantEvent, SamConfig, Intent, AppEntry, ChatMessage } from '../shared/types'
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

  /** Start Menu index + user-defined custom apps (exe paths). */
  async function allApps(): Promise<AppEntry[]> {
    const apps = await loadAppIndex(dataDir)
    const custom = config.load().customApps
      .filter((c) => c.name && c.path)
      .map((c) => ({ name: c.name, appId: `exe:${c.path}` }))
    return [...custom, ...apps]
  }

  const sessionDeps: SessionDeps = {
    listVisibleApps,
    readTabs: () => readOpenTabs(),
    launchApp: async (name) => {
      const apps = await allApps()
      const { match } = findApp(name, apps)
      if (!match) return { ok: false, error: 'no matching app' }
      return launchApp(match.appId)
    },
    openTabGroup: (urls) => openTabGroup(urls),
    isRunning: async (name) => {
      const procs = await listVisibleApps()
      return procs.some((p) => p.name.toLowerCase() === name.toLowerCase())
    }
  }

  async function executeIntent(intent: Intent, originalText: string, past: ChatMessage[]): Promise<void> {
    switch (intent.type) {
      case 'open_app': {
        const apps = await allApps()
        const { match, suggestions } = findApp(intent.name, apps)
        if (match) {
          const r = launchApp(match.appId)
          emit(r.ok
            ? { kind: 'result', text: `Opening **${match.name}**` }
            : { kind: 'error', text: r.error ?? 'Launch failed', retryable: false })
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
          ...past,
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
      // snapshot history BEFORE adding the new message, so the model
      // doesn't see the current question twice
      const past = history.recent(6)
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
      const intent = await parseIntent(text, past, (m, tools) =>
        router.chat(m, tools ?? INTENT_TOOLS)
      )
      await executeIntent(intent, text, past)
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
  })

  ipcMain.handle('overlay:focus', () => ctx.overlay.focus())

  ipcMain.handle('overlay:hide', () => ctx.overlay.hide())

  ipcMain.handle('image:clear', () => { attachedImage = null })

  ipcMain.handle('snip:start', () => ctx.openSnip())
  ipcMain.handle('snip:done', (_e, dataUrl: string) => {
    attachedImage = dataUrl
    ctx.closeSnip()
    ctx.overlay.show()
    ctx.overlay.webContents.send('snip:attached', dataUrl)
  })
  ipcMain.handle('snip:cancel', () => ctx.closeSnip())

  ipcMain.handle('settings:open', () => ctx.openSettings())

  return { config }
}
