import { app, BrowserWindow, session, globalShortcut } from 'electron'
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
      toggleOverlay: () => {
        if (!overlay) return
        // Alt+Space toggles: hide if showing, else summon the type box
        if (overlay.isVisible()) {
          overlay.hide()
        } else {
          overlay.show()
          overlay.webContents.send('hotkey', 'toggleOverlay')
        }
      },
      pushToTalk: () => {
        if (!overlay) return
        overlay.show()
        overlay.webContents.send('hotkey', 'pushToTalk')
      },
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
