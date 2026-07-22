import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

const preload = join(__dirname, '../preload/index.js')

function load(win: BrowserWindow, page: 'overlay' | 'snip' | 'settings'): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    // vite renderer root is src/renderer, so pages are served at /<page>/index.html
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}/index.html`)
  } else {
    win.loadFile(join(__dirname, `../renderer/${page}/index.html`))
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
    show: false,
    webPreferences: { preload, devTools: false }
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
    webPreferences: { preload, devTools: false }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  load(win, 'snip')
  return win
}

export function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 940,
    height: 660,
    minWidth: 720,
    minHeight: 520,
    title: 'Sam Settings',
    frame: false,
    backgroundColor: '#15171f',
    webPreferences: { preload, devTools: false }
  })
  load(win, 'settings')
  return win
}
