import { spawn } from 'child_process'

/**
 * Launches any Start Menu app (win32 or UWP) by its AppID via the shell.
 * AppIDs prefixed with "exe:" are custom apps launched directly by path.
 */
export function launchApp(appId: string): void {
  const child = appId.startsWith('exe:')
    ? spawn(appId.slice(4), [], { detached: true, stdio: 'ignore' })
    : spawn('explorer.exe', [`shell:AppsFolder\\${appId}`], { detached: true, stdio: 'ignore' })
  child.unref()
}
