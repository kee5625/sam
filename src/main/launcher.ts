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
