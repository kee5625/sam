import { app, BrowserWindow, session, globalShortcut, Menu } from 'electron'
import { createOverlayWindow, createSnipWindow, createSettingsWindow } from './windows'
import { registerHotkeys } from './hotkeys'
import { setupIpc } from './ipc'
import { captureScreen } from './capture'

// Last-resort guard: a stray async error (e.g. a bad spawn) should log,
// not kill the assistant with a dialog box
process.on('uncaughtException', (e) => console.error('[sam] uncaught:', e))

let overlay: BrowserWindow | null = null
let snip: BrowserWindow | null = null
let settings: BrowserWindow | null = null

// No application menu — kills the File/Edit/View/Window bar and its
// accelerators (including the devtools shortcut).
Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  // Auto-grant mic access for our own renderer
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media')
  })

  overlay = createOverlayWindow()

  // Surface renderer failures — a dead overlay renderer silently swallows the
  // toggle/push-to-talk hotkeys (they only send IPC), while Alt+Q still works
  // because the snip runs entirely in the main process.
  overlay.webContents.on('render-process-gone', (_e, d) =>
    console.error('[sam] overlay renderer gone:', d.reason))
  overlay.webContents.on('preload-error', (_e, path, err) =>
    console.error('[sam] preload failed:', path, err))
  overlay.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.error('[sam] overlay console:', message)
  })
  overlay.webContents.once('did-finish-load', () => console.log('[sam] overlay renderer ready'))
  if (process.env['SAM_DEBUG'] === '1') overlay.webContents.openDevTools({ mode: 'detach' })

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
    const bindings = config.load().hotkeys
    const failed = registerHotkeys(bindings, {
      toggleOverlay: () => {
        console.log('[sam] hotkey: toggleOverlay')
        if (!overlay) return
        // Alt+Space toggles: hide if showing, else summon the type box
        if (overlay.isVisible()) {
          overlay.hide()
          // let the renderer drop stale state so the next open isn't a flash
          // of the previous toast/response
          overlay.webContents.send('overlay:hidden')
        } else {
          overlay.show()
          overlay.webContents.send('hotkey', 'toggleOverlay')
        }
      },
      pushToTalk: () => {
        console.log('[sam] hotkey: pushToTalk')
        if (!overlay) return
        overlay.show()
        overlay.webContents.send('hotkey', 'pushToTalk')
      },
      snip: () => {
        console.log('[sam] hotkey: snip')
        void openSnip()
      }
    })
    console.log('[sam] hotkeys registered:', bindings, failed.length ? `FAILED: ${failed.join(', ')}` : 'all ok')
    return failed
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
