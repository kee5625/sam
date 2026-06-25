import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname } from 'path'

/**
 * Launches any Start Menu app (win32 or UWP) by its AppID via the shell.
 * AppIDs prefixed with "exe:" are custom apps launched directly by path.
 * Never throws — a bad path must not crash the main process.
 */
export function launchApp(appId: string): { ok: boolean; error?: string } {
  if (appId.startsWith('exe:')) {
    const exePath = appId.slice(4).trim().replace(/^"(.*)"$/, '$1')
    if (!existsSync(exePath)) {
      return {
        ok: false,
        error: `File not found: ${exePath} — check the path in Settings → Custom apps (point at the .exe itself)`
      }
    }
    try {
      // spaces in exePath are safe: spawn passes it as a single argument, not a
      // shell string. cwd = the exe's folder so apps that load resources/DLLs
      // relative to their install dir (e.g. Spotify) start correctly.
      const child = spawn(exePath, [], {
        detached: true,
        stdio: 'ignore',
        cwd: dirname(exePath),
        windowsHide: true
      })
      child.on('error', () => {})
      child.unref()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  try {
    const child = spawn('explorer.exe', [`shell:AppsFolder\\${appId}`], {
      detached: true,
      stdio: 'ignore'
    })
    child.on('error', () => {})
    child.unref()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
