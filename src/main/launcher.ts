import { spawn } from 'child_process'
import { existsSync } from 'fs'

/**
 * Launches any Start Menu app (win32 or UWP) by its AppID via the shell.
 * AppIDs prefixed with "exe:" are custom apps launched directly by path.
 * Never throws — a bad path must not crash the main process.
 */
export function launchApp(appId: string): { ok: boolean; error?: string } {
  let cmd: string
  let args: string[]
  if (appId.startsWith('exe:')) {
    const exePath = appId.slice(4)
    if (!existsSync(exePath)) {
      return { ok: false, error: `File not found: ${exePath} — check the path in Settings → Custom apps (must point at the .exe itself)` }
    }
    cmd = exePath
    args = []
  } else {
    cmd = 'explorer.exe'
    args = [`shell:AppsFolder\\${appId}`]
  }
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
    // spawn errors arrive async — swallow them so they can't crash the app
    child.on('error', () => {})
    child.unref()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
